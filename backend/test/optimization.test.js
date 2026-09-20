import assert from 'node:assert/strict';
import test from 'node:test';
import { greedyOptimize } from '../src/services/optimization/greedy-optimizer.js';
import { createOptimizationService } from '../src/services/optimization/optimization-service.js';
import { createResourceIntelligenceService } from '../src/services/resources/resource-intelligence-service.js';
import { RESOURCE_SCORE_WEIGHTS } from '../src/services/resources/resource-scoring-config.js';

function incident(incidentId, priority, capabilities, location = { lat: 23.03, lng: 72.58 }) {
  return {
    incidentId,
    priority,
    severity: priority === 'P0' ? 5 : 3,
    latitude: location?.lat ?? null,
    longitude: location?.lng ?? null,
    requiredCapabilities: capabilities.map((code) => ({ quantity: 1, capability: { code } })),
  };
}

function resource(resourceId, type, capabilities, overrides = {}) {
  return {
    resourceId,
    name: resourceId,
    type,
    status: 'AVAILABLE',
    capacity: { units: 1 },
    location: { lat: 23.02, lng: 72.57 },
    distanceMeters: 2_000,
    capabilities: capabilities.map((code) => ({ code, name: code, proficiency: 1 })),
    ...overrides,
  };
}

function fakeRouting() {
  return {
    async rankByTravelTime({ resources }) {
      return resources.map((item, index) => ({
        resource: item,
        route: {
          etaMinutes: index + 4,
          distanceMeters: item.distanceMeters,
          provider: 'OSRM',
        },
      }));
    },
  };
}

test('resource intelligence filters eligibility and covers multiple capabilities', async () => {
  const record = incident('INC-1', 'P0', ['fire_response', 'medical']);
  const available = [
    resource('FIRE-1', 'FIRE_TRUCK', ['fire_response']),
    resource('AMB-1', 'AMBULANCE', ['medical'], { capacity: { patients: 2 } }),
    resource('OFF-1', 'AMBULANCE', ['medical'], { status: 'OFFLINE' }),
  ];
  const service = createResourceIntelligenceService({
    incidents: { async findByIncidentId() { return record; } },
    geo: { async findCandidateResources() { return available; } },
    routing: fakeRouting(),
    optimizer: { async optimize(payload) { return greedyOptimize(payload); } },
  });
  const result = await service.recommend(['INC-1']);
  assert.equal(result.optimizer, 'FALLBACK_GREEDY');
  assert.deepEqual(result.assignments.map(({ resourceId }) => resourceId).sort(), ['AMB-1', 'FIRE-1']);
  assert.deepEqual(result.coverage[0].covered, ['fire_response', 'medical']);
  assert.deepEqual(result.coverage[0].uncovered, []);
  assert.equal(result.meta.eligibleResources, 2);
  assert.ok(result.assignments.every(({ reasonFactors }) => reasonFactors.some((reason) => reason.startsWith('ETA '))));
  assert.ok(result.assignments.every(({ score }) => score > 0 && score <= 1));
});

test('global greedy fallback enforces exclusivity and gives scarce capability to P0', () => {
  const result = greedyOptimize({
    incidents: [
      { incidentId: 'INC-P2', priority: 'P2', severity: 3, requiredCapabilities: ['medical'] },
      { incidentId: 'INC-P0', priority: 'P0', severity: 5, requiredCapabilities: ['medical'] },
    ],
    resources: [{ resourceId: 'AMB-1', capabilities: ['medical'], capacity: 2 }],
    candidates: [
      { incidentId: 'INC-P2', resourceId: 'AMB-1', etaMinutes: 2, score: 0.9, reasonFactors: [] },
      { incidentId: 'INC-P0', resourceId: 'AMB-1', etaMinutes: 8, score: 0.7, reasonFactors: [] },
    ],
  });
  assert.equal(result.status, 'PARTIAL');
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].incidentId, 'INC-P0');
  assert.deepEqual(result.unfulfilledRequirements, [{ incidentId: 'INC-P2', capability: 'medical' }]);
});

test('optimizer outage uses explicit deterministic fallback', async () => {
  const service = createOptimizationService({
    fetchImpl: async () => { throw new TypeError('optimizer unavailable'); },
  });
  const result = await service.optimize({
    incidents: [{ incidentId: 'INC-1', priority: 'P1', severity: 4, requiredCapabilities: ['hazmat'] }],
    resources: [],
    candidates: [],
  });
  assert.equal(result.optimizer, 'FALLBACK_GREEDY');
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.unfulfilledRequirements, [{ incidentId: 'INC-1', capability: 'hazmat' }]);
});

test('valid sidecar output is identified as OR-Tools', async () => {
  const service = createOptimizationService({
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        status: 'OPTIMAL', assignments: [], unfulfilledRequirements: [], objectiveValue: 0,
      }),
    }),
  });
  const result = await service.optimize({ incidents: [], resources: [], candidates: [] });
  assert.equal(result.optimizer, 'OR_TOOLS');
  assert.equal(result.status, 'OPTIMAL');
});

test('no eligible resources returns shortages without crashing', async () => {
  const record = incident('INC-EMPTY', 'P1', ['hazmat']);
  const service = createResourceIntelligenceService({
    incidents: { async findByIncidentId() { return record; } },
    geo: { async findCandidateResources() { return []; } },
    routing: fakeRouting(),
    optimizer: { async optimize(payload) { return greedyOptimize(payload); } },
  });
  const result = await service.recommend(['INC-EMPTY']);
  assert.equal(result.status, 'PARTIAL');
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.shortages, [{
    incidentId: 'INC-EMPTY', capability: 'hazmat', required: 1, available: 0,
  }]);
});

test('candidate scoring weights are centralized and normalized', () => {
  const total = Object.values(RESOURCE_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 1);
});
