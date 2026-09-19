import { NotFoundError } from '../../errors/application-error.js';
import { alertService } from '../monitoring/alert-service.js';
import { assignmentRepository } from '../../repositories/assignmentRepository.js';
import { geoService } from '../geo/geo-service.js';
import { hospitalRepository } from '../../repositories/hospitalRepository.js';
import { incidentRepository } from '../../repositories/incidentRepository.js';
import { resourceRepository } from '../../repositories/resourceRepository.js';

const activeAlertStatuses = new Set(['ACTIVE', 'ACKNOWLEDGED']);

function location(entity) {
  if (entity.latitude === null || entity.latitude === undefined) return null;
  return { lat: Number(entity.latitude), lng: Number(entity.longitude) };
}

function incidentView(incident) {
  return {
    incidentId: incident.incidentId,
    type: incident.type,
    severity: incident.severity,
    priority: incident.priority,
    status: incident.status,
    confidence: incident.confidence === null ? null : Number(incident.confidence),
    title: incident.title,
    summary: incident.summary,
    estimatedVictims: incident.estimatedVictims,
    estimatedInjured: incident.estimatedInjured,
    estimatedTrapped: incident.estimatedTrapped,
    hazards: incident.hazards ?? [],
    requiredCapabilities: (incident.requiredCapabilities ?? []).map((item) => typeof item === 'string' ? item : item.capability.code),
    location: incident.location ?? location(incident),
    detectedAt: incident.detectedAt,
    updatedAt: incident.updatedAt,
  };
}

function resourceView(resource) {
  return {
    resourceId: resource.resourceId,
    name: resource.name,
    type: resource.type,
    status: resource.status,
    location: resource.location ?? location(resource),
    availability: resource.availability,
    capacity: resource.capacity,
    currentIncidentId: resource.currentIncident?.incidentId ?? null,
    capabilities: (resource.capabilities ?? []).map((item) => item.code ?? item.capability?.code).filter(Boolean),
    updatedAt: resource.updatedAt,
    ...(resource.distanceMeters === undefined ? {} : { distanceMeters: resource.distanceMeters }),
  };
}

function hospitalView(hospital) {
  return {
    hospitalId: hospital.hospitalId,
    name: hospital.name,
    status: hospital.status,
    location: hospital.location ?? location(hospital),
    availableBeds: hospital.availableBeds,
    availableIcuBeds: hospital.availableIcuBeds,
    availableEmergencyCapacity: hospital.availableEmergencyCapacity,
    ambulanceCapacity: hospital.ambulanceCapacity,
    statusUpdatedAt: hospital.statusUpdatedAt,
    ...(hospital.distanceMeters === undefined ? {} : { distanceMeters: hospital.distanceMeters }),
  };
}

function assignmentView(assignment) {
  return {
    assignmentId: assignment.assignmentId,
    incidentId: assignment.incident?.incidentId,
    resourceId: assignment.resource?.resourceId,
    resourceName: assignment.resource?.name,
    resourceStatus: assignment.resource?.status,
    status: assignment.status,
    role: assignment.role,
    assignedAt: assignment.assignedAt,
    estimatedArrival: assignment.estimatedArrival,
    estimatedTravelTimeSeconds: assignment.estimatedTravelTime,
    updatedAt: assignment.updatedAt,
  };
}

function eventView(relationship) {
  const { event } = relationship;
  const payload = event.payload ?? {};
  const observation = payload.text ?? payload.transcript ?? payload.message ?? payload.description
    ?? payload.observation ?? payload.status ?? null;
  return {
    eventId: event.eventId,
    source: event.source,
    eventType: event.eventType,
    timestamp: event.timestamp,
    relationshipType: relationship.relationshipType,
    observation: observation === null ? null : String(observation).slice(0, 500),
    updatedAt: event.updatedAt,
  };
}

function latestTimestamp(values) {
  const timestamps = values.flat(Infinity).filter(Boolean).map((value) => new Date(value).getTime()).filter(Number.isFinite);
  return new Date(Math.max(...timestamps, 0)).toISOString();
}

export function createOperationalAITools({
  incidents = incidentRepository,
  resources = resourceRepository,
  assignments = assignmentRepository,
  hospitals = hospitalRepository,
  alerts = alertService,
  geo = geoService,
} = {}) {
  const tools = {
    async getActiveIncidents() {
      return (await incidents.findActive()).map(incidentView);
    },

    async getIncident(incidentId) {
      const incident = await incidents.findByIncidentId(incidentId);
      if (!incident) throw new NotFoundError('Incident not found');
      return incidentView(incident);
    },

    async getIncidentEvents(incidentId) {
      return (await incidents.findEvents(incidentId)).map(eventView);
    },

    async getAllResources() {
      return (await resources.findAll()).map(resourceView);
    },

    async getAvailableResources() {
      return (await resources.findAll()).filter(({ status }) => status === 'AVAILABLE').map(resourceView);
    },

    async getLiveSocialAlerts(limit = 15) {
      try {
        const { twitterConnector } = await import('../../TwitterConnector/connector.js');
        return twitterConnector.getIncidents(limit);
      } catch {
        return [];
      }
    },

    async getNearbyResources(incidentId) {
      const incident = await tools.getIncident(incidentId);
      if (!incident.location) return [];
      const nearby = await geo.findNearbyResources({
        ...incident.location,
        capabilities: incident.requiredCapabilities,
        capabilityMatch: 'ANY',
        excludeAssigned: true,
      });
      return nearby.map(resourceView);
    },

    async getResource(resourceId) {
      const resource = await resources.findByResourceId(resourceId);
      if (!resource) throw new NotFoundError('Resource not found');
      return resourceView(resource);
    },

    async getAssignmentsForIncident(incidentId) {
      return (await assignments.findIncidentAssignments(incidentId)).map(assignmentView);
    },

    async getHospitals() {
      return (await hospitals.findAll()).map(hospitalView);
    },

    async getNearbyHospitals(incidentId) {
      const incident = await tools.getIncident(incidentId);
      if (!incident.location) return [];
      return (await geo.findNearbyHospitals({ ...incident.location })).map(hospitalView);
    },

    async getActiveAlerts() {
      return (await alerts.list()).filter(({ status }) => activeAlertStatuses.has(status));
    },

    async getAlertsForIncident(incidentId) {
      return (await alerts.list({ incidentId })).filter(({ status }) => activeAlertStatuses.has(status));
    },

    async getDelayedIncidents() {
      const [activeIncidents, activeAlerts] = await Promise.all([tools.getActiveIncidents(), tools.getActiveAlerts()]);
      const delayedIds = new Set(activeAlerts.filter(({ type }) => type === 'RESPONSE_DELAY').map(({ incidentId }) => incidentId));
      return activeIncidents.filter(({ incidentId, status }) => status === 'DELAYED' || delayedIds.has(incidentId));
    },

    async getResourceShortages() {
      return (await tools.getActiveAlerts()).filter(({ type }) => type === 'RESOURCE_SHORTAGE');
    },

    async getIncidentsNearHospital(hospitalId) {
      const hospital = await hospitals.findByHospitalId(hospitalId);
      if (!hospital) throw new NotFoundError('Hospital not found');
      return (await geo.findNearbyIncidents({ ...location(hospital) })).map(incidentView);
    },

    async getCurrentOperationalSummary() {
      const [activeIncidents, availableResources, allHospitals, activeAlerts, delayedIncidents, resourceShortages] = await Promise.all([
        tools.getActiveIncidents(), tools.getAvailableResources(), tools.getHospitals(), tools.getActiveAlerts(),
        tools.getDelayedIncidents(), tools.getResourceShortages(),
      ]);
      return {
        counts: {
          activeIncidents: activeIncidents.length,
          criticalIncidents: activeIncidents.filter(({ priority, severity }) => priority === 'P0' || severity >= 5).length,
          delayedIncidents: delayedIncidents.length,
          availableResources: availableResources.length,
          activeAlerts: activeAlerts.length,
          resourceShortages: resourceShortages.length,
        },
        urgentIncidents: activeIncidents.slice(0, 8),
        delayedIncidents,
        resourceShortages,
        hospitals: allHospitals.sort((left, right) => right.availableEmergencyCapacity - left.availableEmergencyCapacity).slice(0, 8),
      };
    },

    async getIncidentSituation(incidentId) {
      const [incident, events, incidentAssignments, incidentAlerts, nearbyResources, nearbyHospitals, shortages] = await Promise.all([
        tools.getIncident(incidentId), tools.getIncidentEvents(incidentId), tools.getAssignmentsForIncident(incidentId),
        tools.getAlertsForIncident(incidentId), tools.getNearbyResources(incidentId), tools.getNearbyHospitals(incidentId),
        tools.getResourceShortages(),
      ]);
      const relevantShortages = shortages.filter((alert) => !alert.incidentId || alert.incidentId === incidentId);
      const sourceStateTimestamp = latestTimestamp([
        incident.updatedAt,
        events.map(({ updatedAt }) => updatedAt),
        incidentAssignments.map(({ updatedAt }) => updatedAt),
        incidentAlerts.map(({ updatedAt }) => updatedAt),
        nearbyResources.map(({ updatedAt }) => updatedAt),
        nearbyHospitals.map(({ statusUpdatedAt }) => statusUpdatedAt),
        relevantShortages.map(({ updatedAt }) => updatedAt),
      ]);
      return {
        incident, events, assignments: incidentAssignments, alerts: incidentAlerts,
        nearbyResources: nearbyResources.slice(0, 12), nearbyHospitals: nearbyHospitals.slice(0, 8),
        resourceShortages: relevantShortages,
        escalationState: incidentAlerts.filter(({ type }) => type === 'ESCALATION'),
        sourceStateTimestamp,
      };
    },
  };
  return Object.freeze(tools);
}

export const operationalAITools = createOperationalAITools();
