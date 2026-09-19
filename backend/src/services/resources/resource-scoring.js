import { RESOURCE_SCORE_LIMITS, RESOURCE_SCORE_WEIGHTS } from './resource-scoring-config.js';

const PRIORITY_SCORE = Object.freeze({ P0: 1, P1: 0.8, P2: 0.55, P3: 0.3 });

export function numericCapacity(capacity) {
  if (typeof capacity === 'number' && Number.isFinite(capacity)) return Math.max(0, capacity);
  if (!capacity || typeof capacity !== 'object') return 1;
  const values = Object.values(capacity).filter((value) => typeof value === 'number' && Number.isFinite(value));
  return values.length ? Math.max(0, ...values) : 1;
}

function rounded(value) {
  return Math.round(value * 1_000) / 1_000;
}

export function scoreResourceCandidate({ incident, resource, route, activeWorkload = 0 }) {
  const resourceCapabilities = resource.capabilities.map((capability) => capability.code ?? capability);
  const required = incident.requiredCapabilities;
  const matchedCapabilities = required.filter((capability) => resourceCapabilities.includes(capability));
  const factors = {
    capabilityMatch: required.length ? matchedCapabilities.length / required.length : 1,
    eta: Math.max(0, 1 - route.etaMinutes / RESOURCE_SCORE_LIMITS.etaMinutes),
    distance: Math.max(0, 1 - route.distanceMeters / RESOURCE_SCORE_LIMITS.distanceMeters),
    capacity: Math.min(1, numericCapacity(resource.capacity) / RESOURCE_SCORE_LIMITS.capacity),
    availability: resource.status === 'AVAILABLE' ? 1 : 0,
    workload: activeWorkload === 0 ? 1 : Math.max(0, 1 - activeWorkload / 3),
    incidentPriority: PRIORITY_SCORE[incident.priority] ?? 0,
  };
  const score = rounded(Object.entries(RESOURCE_SCORE_WEIGHTS)
    .reduce((total, [name, weight]) => total + factors[name] * weight, 0));
  const reasonFactors = [
    `matches ${matchedCapabilities.join(', ')} capability${matchedCapabilities.length === 1 ? '' : 'ies'}`,
    `ETA ${route.etaMinutes} minute${route.etaMinutes === 1 ? '' : 's'}`,
    `${Math.round(route.distanceMeters)} meters away`,
    'resource is available with no active assignment',
    `incident priority ${incident.priority}`,
  ];
  return { score, factors: Object.fromEntries(Object.entries(factors).map(([key, value]) => [key, rounded(value)])), matchedCapabilities, reasonFactors };
}
