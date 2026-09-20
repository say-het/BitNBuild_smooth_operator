import assert from 'node:assert/strict';
import test from 'node:test';
import { generateDeterministicSituationAnalysis } from '../src/services/ai/deterministic-analyst.js';
import { createSituationAnalysisService } from '../src/services/ai/situation-analysis-service.js';
import { createCopilotService } from '../src/services/ai/copilot-service.js';

test('deterministic situation analyst produces valid schema-compliant briefings', () => {
  const mockContext = {
    incident: {
      incidentId: 'INC-TEST-001',
      type: 'FIRE',
      severity: 3,
      priority: 'P1',
      status: 'ASSESSING',
      title: 'Warehouse Fire',
      hazards: ['smoke', 'flammable_liquids'],
      estimatedVictims: 10,
      estimatedInjured: 3,
      estimatedTrapped: 2,
      requiredCapabilities: ['fire_response', 'medical', 'heavy_rescue'],
      confidence: 0.88,
    },
    assignments: [
      {
        resourceId: 'RES-FIRE-01',
        resource: { name: 'Fire Engine One', capabilities: ['fire_response'] },
        status: 'EN_ROUTE',
        etaMinutes: 4,
      },
    ],
    alerts: [
      { type: 'RESPONSE_DELAY', title: 'Response SLA Warning', message: 'Unit en route is delayed.' },
    ],
    nearbyHospitals: [
      { hospitalId: 'HSP-001', name: 'Central Hospital', availableBeds: 50, availableIcuBeds: 5, distanceMeters: 2500, status: 'OPERATIONAL' },
      { hospitalId: 'HSP-002', name: 'West Hospital', availableBeds: 0, availableIcuBeds: 0, distanceMeters: 4000, status: 'OVERLOADED' },
    ],
    resourceShortages: [
      { title: 'Heavy Rescue Shortage' },
    ],
  };

  const analysis = generateDeterministicSituationAnalysis(mockContext);
  assert.equal(analysis.incidentId, 'INC-TEST-001');
  assert.ok(analysis.summary.includes('Warehouse Fire'));
  assert.ok(analysis.summary.includes('3 injured'));
  assert.ok(analysis.summary.includes('2 trapped'));
  assert.ok(analysis.currentResponse.includes('Fire Engine One'));
  assert.ok(analysis.keyRisks.length > 0);
  assert.ok(analysis.resourceGaps.some((g) => g.includes('medical')));
  assert.ok(analysis.resourceGaps.some((g) => g.includes('heavy rescue')));
  assert.ok(analysis.hospitalConsiderations.some((h) => h.includes('Central Hospital')));
  assert.ok(analysis.hospitalConsiderations.some((h) => h.includes('OVERLOADED')));
  assert.ok(analysis.recommendedActions.some((a) => a.type === 'REVIEW_RESOURCE_GAP'));
  assert.ok(analysis.recommendedActions.some((a) => a.type === 'REVIEW_ESCALATION'));
  assert.ok(analysis.confidence >= 0.7 && analysis.confidence <= 1.0);
});

test('situationAnalysisService returns available deterministic analysis when Gemini is unconfigured', async () => {
  const mockTools = {
    async getIncidentSituation(incidentId) {
      return {
        incident: {
          incidentId,
          type: 'FLOOD',
          severity: 2,
          priority: 'P2',
          status: 'CREATED',
          title: 'Street Flooding',
          requiredCapabilities: ['water_rescue'],
          confidence: 0.8,
        },
        assignments: [],
        alerts: [],
        nearbyHospitals: [],
        resourceShortages: [],
        sourceStateTimestamp: new Date().toISOString(),
      };
    },
  };

  const mockUnconfiguredClient = {
    isConfigured: () => false,
    model: 'unconfigured',
  };

  const service = createSituationAnalysisService({
    tools: mockTools,
    client: mockUnconfiguredClient,
  });

  const result = await service.analyze('INC-TEST-002');
  assert.equal(result.available, true);
  assert.ok(result.analysis);
  assert.equal(result.analysis.incidentId, 'INC-TEST-002');
  assert.equal(result.model, 'DETERMINISTIC_ANALYST');

  // Verify get() also returns the generated analysis
  const fetched = await service.get('INC-TEST-002');
  assert.equal(fetched.available, true);
  assert.ok(fetched.analysis);
  assert.equal(fetched.stale, false);
});

test('copilotService answers operational queries deterministically when Gemini is unconfigured', async () => {
  const mockTools = {
    async getActiveIncidents() {
      return [{ incidentId: 'INC-01', title: 'Factory Fire', priority: 'P1', status: 'ASSESSING' }];
    },
    async getAvailableResources() {
      return [{ resourceId: 'RES-01', name: 'Ambulance Alpha', type: 'AMBULANCE', capabilities: ['medical'] }];
    },
    async getHospitals() {
      return [{ hospitalId: 'HSP-01', name: 'Metro Health', status: 'OPERATIONAL', availableBeds: 20, availableIcuBeds: 4, availableEmergencyCapacity: 10 }];
    },
    async getIncidentSituation(id) {
      return {
        incident: { incidentId: id, title: 'Factory Fire', priority: 'P1', status: 'ASSESSING', severity: 4 },
        assignments: [],
      };
    },
    async getResource(id) {
      return { resourceId: id, name: 'Ambulance Alpha', status: 'AVAILABLE' };
    },
    async getDelayedIncidents() { return []; },
    async getResourceShortages() { return []; },
    async getCurrentOperationalSummary() {
      return { counts: { activeIncidents: 1, criticalIncidents: 1, delayedIncidents: 0, availableResources: 1, activeAlerts: 0, resourceShortages: 0 } };
    },
  };

  const mockUnconfiguredClient = {
    isConfigured: () => false,
    model: 'unconfigured',
  };

  const copilot = createCopilotService({
    tools: mockTools,
    client: mockUnconfiguredClient,
  });

  const incidentQuery = await copilot.query({ message: 'Tell me about INC-01' });
  assert.equal(incidentQuery.available, true);
  assert.ok(incidentQuery.answer.includes('Factory Fire'));
  assert.ok(incidentQuery.mapActions.some((a) => a.incidentId === 'INC-01'));

  const resourceQuery = await copilot.query({ message: 'Which resources are available?' });
  assert.equal(resourceQuery.available, true);
  assert.ok(resourceQuery.answer.includes('Ambulance Alpha'));
  assert.ok(resourceQuery.references.some((r) => r.entityId === 'RES-01'));
});
