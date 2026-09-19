import { NotFoundError } from '../../errors/application-error.js';
import { incidentRepository } from '../../repositories/incidentRepository.js';
import { geoService } from '../geo/geo-service.js';
import { optimizationService } from '../optimization/optimization-service.js';
import { routingService } from '../routing/routing-service.js';
import { numericCapacity, scoreResourceCandidate } from './resource-scoring.js';

function presentIncident(incident) {
  const requirements = incident.requiredCapabilities.map(({ capability, quantity }) => ({
    capability: capability.code,
    quantity,
  }));
  return {
    incidentId: incident.incidentId,
    priority: incident.priority,
    severity: incident.severity,
    requiredCapabilities: requirements.map(({ capability }) => capability),
    requirements,
    location: incident.latitude === null || incident.latitude === undefined
      ? null
      : { lat: Number(incident.latitude), lng: Number(incident.longitude) },
  };
}

function optimizerResource(resource) {
  return {
    resourceId: resource.resourceId,
    type: resource.type,
    capabilities: resource.capabilities.map((capability) => capability.code ?? capability),
    capacity: numericCapacity(resource.capacity),
  };
}

function shortagesFor(incidents, candidates, resources) {
  const resourceById = new Map(resources.map((resource) => [resource.resourceId, resource]));
  return incidents.flatMap((incident) => incident.requirements.flatMap((requirement) => {
    const available = new Set(candidates
      .filter((candidate) => candidate.incidentId === incident.incidentId)
      .filter((candidate) => resourceById.get(candidate.resourceId)?.capabilities.includes(requirement.capability))
      .map(({ resourceId }) => resourceId)).size;
    return available < requirement.quantity ? [{
      incidentId: incident.incidentId,
      capability: requirement.capability,
      required: requirement.quantity,
      available,
    }] : [];
  }));
}

function coverageFor(incidents, assignments, unfulfilledRequirements) {
  return incidents.map((incident) => {
    const covered = [...new Set(assignments
      .filter((assignment) => assignment.incidentId === incident.incidentId)
      .flatMap((assignment) => assignment.capabilitiesCovered))].sort();
    const uncovered = [...new Set(unfulfilledRequirements
      .filter((item) => item.incidentId === incident.incidentId)
      .map(({ capability }) => capability))].sort();
    return { incidentId: incident.incidentId, required: incident.requiredCapabilities, covered, uncovered };
  });
}

export function createResourceIntelligenceService({
  incidents = incidentRepository,
  geo = geoService,
  routing = routingService,
  optimizer = optimizationService,
  radiusMeters = 50_000,
} = {}) {
  return {
    async recommend(incidentIds) {
      const loaded = await Promise.all(incidentIds.map((incidentId) => incidents.findByIncidentId(incidentId)));
      const missingIndex = loaded.findIndex((incident) => !incident);
      if (missingIndex !== -1) throw new NotFoundError(`Incident ${incidentIds[missingIndex]} not found`);
      const normalizedIncidents = loaded.map(presentIncident);
      const resourceMap = new Map();
      const candidates = [];

      const candidateGroups = await Promise.all(normalizedIncidents.map(async (incident) => {
        if (!incident.location || incident.requiredCapabilities.length === 0) return [];
        const nearby = await geo.findCandidateResources({
          incidentLocation: incident.location,
          requiredCapabilities: incident.requiredCapabilities,
          radiusMeters,
        });
        const eligible = nearby.filter((resource) => resource.status === 'AVAILABLE' && numericCapacity(resource.capacity) > 0);
        const ranked = await routing.rankByTravelTime({ resources: eligible, destination: incident.location });
        const scored = ranked.map(({ resource, route }) => {
          const explanation = scoreResourceCandidate({ incident, resource, route });
          return {
            resource: optimizerResource(resource),
            incidentId: incident.incidentId,
            resourceId: resource.resourceId,
            etaMinutes: route.etaMinutes,
            distanceMeters: route.distanceMeters,
            routeProvider: route.provider,
            score: explanation.score,
            scoreFactors: explanation.factors,
            reasonFactors: explanation.reasonFactors,
          };
        });
        const closest = [...scored].sort((left, right) => left.etaMinutes - right.etaMinutes || left.resourceId.localeCompare(right.resourceId))[0];
        if (closest) closest.reasonFactors = [...closest.reasonFactors, 'closest eligible unit by ETA'];
        return scored;
      }));
      for (const group of candidateGroups) {
        for (const { resource, ...candidate } of group) {
          resourceMap.set(resource.resourceId, resource);
          candidates.push(candidate);
        }
      }

      const resources = [...resourceMap.values()];
      const payload = {
        incidents: normalizedIncidents.map((incident) => ({
          incidentId: incident.incidentId,
          priority: incident.priority,
          severity: incident.severity,
          requiredCapabilities: incident.requiredCapabilities,
          requirements: incident.requirements,
        })),
        resources,
        candidates,
      };
      const plan = await optimizer.optimize(payload);
      const candidateByPair = new Map(candidates.map((candidate) => [`${candidate.incidentId}:${candidate.resourceId}`, candidate]));
      const assignments = plan.assignments.map((assignment) => {
        const candidate = candidateByPair.get(`${assignment.incidentId}:${assignment.resourceId}`);
        return {
          ...assignment,
          etaMinutes: candidate?.etaMinutes ?? assignment.etaMinutes,
          score: candidate?.score ?? assignment.score,
          reasonFactors: candidate?.reasonFactors ?? assignment.reasonFactors ?? [],
          scoreFactors: candidate?.scoreFactors,
          routeProvider: candidate?.routeProvider,
          distanceMeters: candidate?.distanceMeters,
        };
      });
      return {
        status: plan.status,
        optimizer: plan.optimizer,
        assignments,
        candidates: [...candidates].sort((left, right) => right.score - left.score
          || left.etaMinutes - right.etaMinutes || left.resourceId.localeCompare(right.resourceId)),
        coverage: coverageFor(normalizedIncidents, assignments, plan.unfulfilledRequirements),
        unfulfilledRequirements: plan.unfulfilledRequirements,
        shortages: shortagesFor(normalizedIncidents, candidates, resources),
        objectiveValue: plan.objectiveValue,
        meta: { incidents: normalizedIncidents.length, eligibleResources: resources.length, candidates: candidates.length },
      };
    },
  };
}

export const resourceIntelligenceService = createResourceIntelligenceService();
