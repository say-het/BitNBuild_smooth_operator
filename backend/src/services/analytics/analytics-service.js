import { analyticsRepository } from '../../repositories/analyticsRepository.js';

const ACTIVE_INCIDENT_STATUSES = new Set([
  'CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE',
  'ON_SCENE', 'RESOLVING', 'DELAYED', 'ESCALATED', 'REOPTIMIZED',
]);
const ACTIVE_ALERT_STATUSES = new Set(['ACTIVE', 'ACKNOWLEDGED']);
const BUSY_RESOURCE_STATUSES = new Set(['ASSIGNED', 'EN_ROUTE', 'ON_SCENE']);

function countBy(items, key) {
  return items.reduce((counts, item) => ({ ...counts, [item[key]]: (counts[item[key]] ?? 0) + 1 }), {});
}

function secondsBetween(start, end) {
  if (!start || !end) return null;
  const seconds = (new Date(end).getTime() - new Date(start).getTime()) / 1_000;
  return seconds >= 0 ? seconds : null;
}

function summary(values) {
  const sorted = values.filter((value) => value !== null).sort((left, right) => left - right);
  if (!sorted.length) return { averageMinutes: null, medianMinutes: null, sampleSize: 0 };
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    averageMinutes: Number((sorted.reduce((total, value) => total + value, 0) / sorted.length / 60).toFixed(1)),
    medianMinutes: Number((median / 60).toFixed(1)),
    sampleSize: sorted.length,
  };
}

function responseMetrics(incidents) {
  const assignmentDelay = [];
  const dispatchToEnRoute = [];
  const enRouteToArrival = [];
  const firstResponse = [];
  const criticalFirstResponse = [];
  const resolutionDuration = [];
  const trend = new Map();

  for (const incident of incidents) {
    const assignments = incident.assignments ?? [];
    assignments.forEach((assignment) => {
      assignmentDelay.push(secondsBetween(incident.detectedAt, assignment.assignedAt));
      dispatchToEnRoute.push(secondsBetween(assignment.assignedAt, assignment.departedAt));
      enRouteToArrival.push(secondsBetween(assignment.departedAt, assignment.actualArrival ?? assignment.arrivedAt));
    });
    const arrivals = assignments.map((item) => item.actualArrival ?? item.arrivedAt).filter(Boolean).sort((a, b) => new Date(a) - new Date(b));
    const response = secondsBetween(incident.detectedAt, arrivals[0]);
    if (response !== null) {
      firstResponse.push(response);
      if (incident.priority === 'P0' || incident.severity >= 5) criticalFirstResponse.push(response);
      const day = new Date(incident.detectedAt).toISOString().slice(0, 10);
      const bucket = trend.get(day) ?? [];
      bucket.push(response);
      trend.set(day, bucket);
    }
    resolutionDuration.push(secondsBetween(incident.detectedAt, incident.resolvedAt));
  }

  return {
    assignmentDelay: summary(assignmentDelay),
    dispatchToEnRoute: summary(dispatchToEnRoute),
    enRouteToArrival: summary(enRouteToArrival),
    incidentToFirstResponse: summary(firstResponse),
    criticalIncidentResponse: summary(criticalFirstResponse),
    resolutionDuration: summary(resolutionDuration),
    trend: [...trend.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({
      date,
      averageMinutes: summary(values).averageMinutes,
      sampleSize: values.length,
    })),
  };
}

function resourceMetrics(resources) {
  const byType = Object.entries(resources.reduce((groups, resource) => {
    const group = groups[resource.type] ?? { total: 0, busy: 0, statuses: {} };
    group.total += 1;
    group.busy += BUSY_RESOURCE_STATUSES.has(resource.status) ? 1 : 0;
    group.statuses[resource.status] = (group.statuses[resource.status] ?? 0) + 1;
    groups[resource.type] = group;
    return groups;
  }, {})).map(([type, group]) => ({
    type, ...group,
    utilizationPercent: group.total ? Number((group.busy / group.total * 100).toFixed(1)) : null,
  }));
  const busy = resources.filter(({ status }) => BUSY_RESOURCE_STATUSES.has(status)).length;
  return {
    total: resources.length,
    byStatus: countBy(resources, 'status'),
    available: resources.filter(({ status }) => status === 'AVAILABLE').length,
    busy,
    utilizationPercent: resources.length ? Number((busy / resources.length * 100).toFixed(1)) : null,
    byType,
  };
}

function hospitalMetrics(hospitals) {
  const totals = hospitals.reduce((result, hospital) => ({
    beds: result.beds + hospital.totalBeds,
    availableBeds: result.availableBeds + hospital.availableBeds,
    icuBeds: result.icuBeds + hospital.icuBeds,
    availableIcuBeds: result.availableIcuBeds + hospital.availableIcuBeds,
    emergencyCapacity: result.emergencyCapacity + hospital.emergencyCapacity,
    availableEmergencyCapacity: result.availableEmergencyCapacity + hospital.availableEmergencyCapacity,
  }), { beds: 0, availableBeds: 0, icuBeds: 0, availableIcuBeds: 0, emergencyCapacity: 0, availableEmergencyCapacity: 0 });
  return { totals, byStatus: countBy(hospitals, 'status'), facilities: hospitals };
}

export function createAnalyticsService({ repository = analyticsRepository, now = () => new Date() } = {}) {
  return {
    async overview() {
      const [{ incidents, resources, alerts, hospitals }, hotspots] = await Promise.all([
        repository.getOperationalSnapshot(), repository.getHotspots(),
      ]);
      const activeIncidents = incidents.filter(({ status }) => ACTIVE_INCIDENT_STATUSES.has(status));
      const activeAlerts = alerts.filter(({ status }) => ACTIVE_ALERT_STATUSES.has(status));
      return {
        generatedAt: now().toISOString(),
        incidents: {
          total: incidents.length,
          active: activeIncidents.length,
          activeCritical: activeIncidents.filter(({ priority, severity }) => priority === 'P0' || severity >= 5).length,
          byType: countBy(incidents, 'type'),
          bySeverity: countBy(incidents, 'severity'),
          byPriority: countBy(incidents, 'priority'),
          byStatus: countBy(incidents, 'status'),
        },
        response: responseMetrics(incidents),
        resources: resourceMetrics(resources),
        alerts: {
          total: alerts.length,
          active: activeAlerts.length,
          byType: countBy(alerts, 'type'),
          slaViolations: activeAlerts.filter(({ type }) => type === 'RESPONSE_DELAY').length,
          escalations: alerts.filter(({ type }) => type === 'ESCALATION').length,
          activeEscalations: activeAlerts.filter(({ type }) => type === 'ESCALATION').length,
          resourceShortages: activeAlerts.filter(({ type }) => type === 'RESOURCE_SHORTAGE').length,
        },
        hospitals: hospitalMetrics(hospitals),
        hotspots: {
          type: 'FeatureCollection',
          features: hotspots.map((item, index) => ({
            type: 'Feature', id: `hotspot-${index}`,
            geometry: { type: 'Point', coordinates: [Number(item.longitude), Number(item.latitude)] },
            properties: { incidentCount: item.incidentCount, severityWeight: item.severityWeight },
          })),
        },
      };
    },
  };
}

export const analyticsService = createAnalyticsService();
