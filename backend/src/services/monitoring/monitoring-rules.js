import { ALERT_SEVERITY } from './monitoring-config.js';

const OFFLINE_RESOURCE_STATUSES = new Set(['UNAVAILABLE', 'MAINTENANCE', 'OFFLINE']);

function elapsedMinutes(now, since) {
  return Math.max(0, (now.getTime() - new Date(since).getTime()) / 60_000);
}

function condition(data) {
  return { escalation: false, metadata: {}, ...data };
}

function incidentReference(incident) {
  return { incidentDbId: incident.id, incidentId: incident.incidentId };
}

export function evaluateIncidentRules(incident, config, now = new Date()) {
  const results = [];
  const reference = incidentReference(incident);
  const age = elapsedMinutes(now, incident.updatedAt);
  const targetMinutes = config.slaMinutes[incident.priority];

  if (incident.priority === 'P0' || incident.severity === 5) {
    results.push(condition({
      ...reference,
      key: `CRITICAL_INCIDENT:${incident.incidentId}`,
      type: 'CRITICAL_INCIDENT',
      severity: ALERT_SEVERITY.CRITICAL,
      title: `Critical incident ${incident.incidentId}`,
      message: `${incident.title} requires P0/critical monitoring.`,
      metadata: { condition: 'CRITICAL_INCIDENT', priority: incident.priority, incidentSeverity: incident.severity },
    }));
  }

  const stalled = config.stallMinutes[incident.status];
  const noAcceptedTeam = incident.status === 'RESOURCE_ASSIGNED'
    && !incident.assignments.some(({ status }) => ['ACCEPTED', 'EN_ROUTE', 'ON_SCENE'].includes(status));
  const shouldFlagStall = stalled && age > stalled && (
    incident.status !== 'RESOURCE_RECOMMENDED' || incident.assignments.length === 0
  ) && (incident.status !== 'RESOURCE_ASSIGNED' || noAcceptedTeam);

  if (shouldFlagStall) {
    results.push(condition({
      ...reference,
      key: `INCIDENT_STALL:${incident.incidentId}:${incident.status}`,
      type: 'RESPONSE_DELAY',
      severity: incident.priority === 'P0' ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
      title: `Incident stalled in ${incident.status}`,
      message: `${incident.incidentId} has remained in ${incident.status} for ${Math.floor(age)} minutes.`,
      escalation: incident.priority === 'P0',
      metadata: { condition: 'INCIDENT_STALLED', stage: incident.status, elapsedMinutes: Math.floor(age), thresholdMinutes: stalled, slaTargetMinutes: targetMinutes },
    }));
  }
  return results;
}

export function evaluateAssignmentRules(incident, config, now = new Date()) {
  const targetMinutes = config.slaMinutes[incident.priority];
  return incident.assignments.flatMap((assignment) => {
    const results = [];
    const reference = {
      ...incidentReference(incident),
      resourceDbId: assignment.resourceId,
      resourceId: assignment.resource.resourceId,
      assignmentId: assignment.assignmentId,
    };
    const elapsed = elapsedMinutes(now, assignment.assignedAt);
    const expectedMinutes = assignment.estimatedTravelTime === null
      ? (assignment.estimatedArrival ? elapsedMinutes(assignment.estimatedArrival, assignment.assignedAt) : null)
      : assignment.estimatedTravelTime / 60;

    if (expectedMinutes !== null && expectedMinutes > targetMinutes) {
      const delayMinutes = Math.ceil(expectedMinutes - targetMinutes);
      results.push(condition({
        ...reference,
        key: `ASSIGNMENT_DELAY:${assignment.assignmentId}:SLA`,
        type: 'RESPONSE_DELAY',
        severity: delayMinutes >= config.escalationDelayMinutes ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
        title: `Assignment ETA exceeds ${incident.priority} SLA`,
        message: `${assignment.resource.resourceId} is estimated ${delayMinutes} minutes beyond the synthetic ${targetMinutes}-minute target.`,
        escalation: incident.priority === 'P0' || delayMinutes >= config.escalationDelayMinutes,
        metadata: { condition: 'ETA_EXCEEDS_SLA', expectedMinutes: targetMinutes, currentEtaMinutes: Math.ceil(expectedMinutes), delayMinutes },
      }));
    }

    if (assignment.status === 'ASSIGNED' && elapsed > config.stallMinutes.RESOURCE_ASSIGNED) {
      results.push(condition({
        ...reference,
        key: `ASSIGNMENT_DELAY:${assignment.assignmentId}:NOT_ACCEPTED`,
        type: 'RESPONSE_DELAY',
        severity: ALERT_SEVERITY.HIGH,
        title: 'Assigned resource has not accepted',
        message: `${assignment.resource.resourceId} has remained assigned for ${Math.floor(elapsed)} minutes.`,
        escalation: incident.priority === 'P0',
        metadata: { condition: 'ASSIGNED_TOO_LONG', elapsedMinutes: Math.floor(elapsed), thresholdMinutes: config.stallMinutes.RESOURCE_ASSIGNED },
      }));
    }

    if (assignment.status === 'EN_ROUTE' && assignment.estimatedArrival) {
      const overdueMinutes = elapsedMinutes(now, assignment.estimatedArrival);
      if (now > assignment.estimatedArrival && overdueMinutes > config.enRouteGraceMinutes) {
        results.push(condition({
          ...reference,
          key: `ASSIGNMENT_DELAY:${assignment.assignmentId}:OVERDUE`,
          type: 'RESPONSE_DELAY',
          severity: overdueMinutes >= config.escalationDelayMinutes ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
          title: 'En-route resource is overdue',
          message: `${assignment.resource.resourceId} is ${Math.ceil(overdueMinutes)} minutes beyond its estimated arrival.`,
          escalation: true,
          metadata: { condition: 'EN_ROUTE_OVERDUE', delayMinutes: Math.ceil(overdueMinutes), graceMinutes: config.enRouteGraceMinutes },
        }));
      }
    }

    if (OFFLINE_RESOURCE_STATUSES.has(assignment.resource.status)) {
      results.push(condition({
        ...reference,
        key: `RESOURCE_FAILURE:${assignment.assignmentId}`,
        type: 'ESCALATION',
        severity: ALERT_SEVERITY.CRITICAL,
        title: 'Assigned resource is unavailable',
        message: `${assignment.resource.resourceId} is ${assignment.resource.status} while assigned to ${incident.incidentId}.`,
        escalation: true,
        metadata: { condition: 'ASSIGNED_RESOURCE_UNAVAILABLE', resourceStatus: assignment.resource.status },
      }));
    }
    return results;
  });
}

export function evaluateShortageRules(incidents, shortages) {
  const byPublicId = new Map(incidents.map((incident) => [incident.incidentId, incident]));
  return shortages.map((shortage) => {
    const incident = byPublicId.get(shortage.incidentId);
    return condition({
      ...incidentReference(incident),
      key: `RESOURCE_SHORTAGE:${shortage.incidentId}:${shortage.capability}`,
      type: 'RESOURCE_SHORTAGE',
      severity: incident.priority === 'P0' ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
      title: `Resource shortage: ${shortage.capability}`,
      message: `${shortage.incidentId} requires ${shortage.required} ${shortage.capability} unit(s); ${shortage.available} are available.`,
      escalation: true,
      metadata: { condition: 'RESOURCE_SHORTAGE', ...shortage },
    });
  });
}

export function accountForAssignedCoverage(incidents, shortages) {
  const byPublicId = new Map(incidents.map((incident) => [incident.incidentId, incident]));
  return shortages.flatMap((shortage) => {
    const incident = byPublicId.get(shortage.incidentId);
    const assignedCoverage = incident.assignments.filter(({ resource }) => (
      resource.capabilities.some(({ capability }) => capability.code === shortage.capability)
    )).length;
    const available = shortage.available + assignedCoverage;
    return available < shortage.required ? [{ ...shortage, available, assignedCoverage }] : [];
  });
}

export function evaluateHospitalRules(hospitals, config) {
  return hospitals.flatMap((hospital) => {
    const emergencyPercent = hospital.emergencyCapacity > 0
      ? (hospital.availableEmergencyCapacity / hospital.emergencyCapacity) * 100
      : 0;
    const icuPercent = hospital.icuBeds > 0 ? (hospital.availableIcuBeds / hospital.icuBeds) * 100 : 0;
    const reasons = [
      ...(hospital.status === 'OVERLOADED' ? ['status is OVERLOADED'] : []),
      ...(emergencyPercent <= config.hospitalCapacityThresholdPercent ? [`emergency capacity is ${Math.round(emergencyPercent)}%`] : []),
      ...(icuPercent <= config.hospitalCapacityThresholdPercent ? [`ICU capacity is ${Math.round(icuPercent)}%`] : []),
    ];
    if (reasons.length === 0) return [];
    return [condition({
      key: `HOSPITAL_OVERLOAD:${hospital.hospitalId}`,
      type: 'HOSPITAL_OVERLOAD',
      severity: hospital.status === 'OVERLOADED' ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH,
      title: `Hospital capacity warning: ${hospital.name}`,
      message: reasons.join('; '),
      metadata: {
        condition: 'HOSPITAL_OVERLOAD', hospitalId: hospital.hospitalId,
        emergencyAvailablePercent: Math.round(emergencyPercent), icuAvailablePercent: Math.round(icuPercent),
        thresholdPercent: config.hospitalCapacityThresholdPercent,
      },
    })];
  });
}

export function addMultipleFailureEscalations(incidents, conditions) {
  const incidentById = new Map(incidents.map((incident) => [incident.incidentId, incident]));
  const counts = new Map();
  for (const item of conditions) {
    if (item.incidentId && item.type !== 'CRITICAL_INCIDENT') {
      counts.set(item.incidentId, (counts.get(item.incidentId) ?? 0) + 1);
    }
  }
  return [...counts.entries()].flatMap(([incidentId, count]) => {
    if (count < 2) return [];
    const incident = incidentById.get(incidentId);
    return [condition({
      ...incidentReference(incident),
      key: `MULTIPLE_FAILURES:${incidentId}`,
      type: 'ESCALATION',
      severity: ALERT_SEVERITY.CRITICAL,
      title: 'Multiple response problems detected',
      message: `${count} active monitoring problems affect ${incidentId}.`,
      escalation: true,
      metadata: { condition: 'MULTIPLE_FAILURES', failureCount: count },
    })];
  });
}
