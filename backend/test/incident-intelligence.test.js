import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/db/prisma.js';
import { domainEventBus } from '../src/events/domain-event-bus.js';
import { aiAnalysisRepository } from '../src/repositories/aiAnalysisRepository.js';
import { eventRepository } from '../src/repositories/eventRepository.js';
import { createGeminiClient, GeminiClientError } from '../src/services/ai/gemini-client.js';
import { validateAndNormalizeCandidate } from '../src/services/ai/incident-intelligence-contract.js';
import { createIncidentIntelligenceService } from '../src/services/ai/incident-intelligence-service.js';
import { registerIncidentIntelligenceSubscriber } from '../src/services/ai/incident-intelligence-subscriber.js';
import { createEventIngestionService } from '../src/services/events/event-ingestion-service.js';

const databaseEnabled = process.env.RUN_DATABASE_TESTS === 'true';

function validOutput(overrides = {}) {
  return {
    incidentType: 'FIRE',
    title: 'Industrial warehouse fire',
    summary: 'Large fire with smoke and possible trapped victims.',
    severity: 5,
    priority: 'P0',
    confidence: 0.91,
    estimatedVictims: 5,
    estimatedInjured: 2,
    estimatedTrapped: 3,
    hazards: ['Smoke', 'fire'],
    requiredCapabilities: ['medical', 'fire_response', 'search_and_rescue'],
    location: { lat: 23.04, lng: 72.58 },
    locationConfidence: 0.8,
    evidence: ['visible flames', 'people may be trapped'],
    ...overrides,
  };
}

function canonicalEvent(overrides = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    eventId: 'TEST-P05-EV-001',
    source: 'CITIZEN',
    eventType: 'EMERGENCY_REPORT',
    timestamp: new Date('2026-09-19T10:00:00.000Z'),
    latitude: 23.041,
    longitude: 72.581,
    payload: { text: 'Huge warehouse fire and people may be trapped.' },
    ...overrides,
  };
}

function fakeAnalysisRepository() {
  const state = { completed: null, failed: null, skipped: null };
  return {
    state,
    async createOrGet(input) { return { id: 'analysis-1', status: 'PENDING', ...input }; },
    async markProcessing() {},
    async complete(analysis, candidate, options) {
      state.completed = { analysis, candidate, options };
      return { analysis: { ...analysis, status: 'COMPLETED' }, candidate };
    },
    async fail(id, failure) { state.failed = { id, ...failure }; return { id, status: 'FAILED', ...failure }; },
    async skip(id, reason) { state.skipped = { id, reason }; return { id, status: 'SKIPPED' }; },
  };
}

function fakeEvents() {
  return { statuses: [], async updateProcessingStatus(...args) { this.statuses.push(args); } };
}

test('incident candidate validation is strict and deterministic', async (suite) => {
  await suite.test('accepts valid output, normalizes hazards/capabilities, and trusts canonical location', () => {
    const candidate = validateAndNormalizeCandidate(validOutput({ priority: 'P3' }), { lat: 23.041, lng: 72.581 });
    assert.equal(candidate.priority, 'P0');
    assert.deepEqual(candidate.location, { lat: 23.041, lng: 72.581 });
    assert.equal(candidate.locationConfidence, 1);
    assert.deepEqual(candidate.hazards, ['fire', 'smoke']);
    assert.deepEqual(candidate.requiredCapabilities, ['fire_response', 'medical', 'search_and_rescue']);
  });

  const invalid = [
    ['severity', { severity: 99 }],
    ['priority', { priority: 'SUPER_CRITICAL' }],
    ['capability', { requiredCapabilities: ['teleportation'] }],
    ['coordinates', { location: { lat: 100, lng: 72.58 } }],
  ];
  for (const [name, override] of invalid) {
    await suite.test(`rejects invalid ${name}`, () => {
      assert.throws(() => validateAndNormalizeCandidate(validOutput(override), null));
    });
  }
});

test('Gemini client applies bounded transient retries and rejects malformed JSON', async (suite) => {
  await suite.test('retries a rate limit and then accepts structured JSON', async () => {
    let calls = 0;
    const client = createGeminiClient({
      apiKey: 'test-key', model: 'test-model', sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status: 429 };
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(validOutput()) }] } }] }) };
      },
    });
    const result = await client.generateStructured('evidence');
    assert.equal(result.attempts, 2);
    assert.equal(calls, 2);
  });

  await suite.test('stops after three transient attempts', async () => {
    let calls = 0;
    const client = createGeminiClient({
      apiKey: 'test-key', model: 'test-model', sleep: async () => {},
      fetchImpl: async () => { calls += 1; throw new TypeError('network unavailable'); },
    });
    await assert.rejects(client.generateStructured('evidence'), (error) => error.code === 'AI_NETWORK_ERROR' && error.attempts === 3);
    assert.equal(calls, 3);
  });

  await suite.test('does not retry malformed model JSON or missing configuration', async () => {
    let calls = 0;
    const malformed = createGeminiClient({
      apiKey: 'test-key', model: 'test-model', sleep: async () => {},
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{bad json' }] } }] }) };
      },
    });
    await assert.rejects(malformed.generateStructured('evidence'), (error) => error.code === 'AI_INVALID_JSON');
    assert.equal(calls, 1);
    const missing = createGeminiClient({ apiKey: '', model: '', fetchImpl: async () => assert.fail('must not call') });
    await assert.rejects(missing.generateStructured('evidence'), (error) => error.code === 'AI_CONFIGURATION_MISSING');
  });
});

test('Incident Intelligence accepts valid Gemini output and fails safely on invalid output', async (suite) => {
  await suite.test('persists a validated candidate', async () => {
    const repository = fakeAnalysisRepository();
    const events = fakeEvents();
    const service = createIncidentIntelligenceService({
      analysisRepository: repository,
      events,
      client: { provider: 'GEMINI', model: 'test-model', generateStructured: async () => ({ output: validOutput(), attempts: 1 }) },
    });
    const result = await service.analyzeEvent(canonicalEvent());
    assert.equal(result.status, 'COMPLETED');
    assert.equal(repository.state.completed.candidate.incidentType, 'FIRE');
    assert.equal(events.statuses.at(-1)[1], 'PROCESSED');
  });

  await suite.test('records invalid output without throwing', async () => {
    const repository = fakeAnalysisRepository();
    const events = fakeEvents();
    const service = createIncidentIntelligenceService({
      analysisRepository: repository,
      events,
      client: { provider: 'GEMINI', model: 'test-model', generateStructured: async () => ({ output: validOutput({ severity: 99 }), attempts: 1 }) },
    });
    const result = await service.analyzeEvent(canonicalEvent());
    assert.equal(result.status, 'FAILED');
    assert.equal(result.errorCode, 'AI_INVALID_OUTPUT');
    assert.equal(events.statuses.at(-1)[1], 'FAILED');
  });

  await suite.test('records provider timeout safely', async () => {
    const repository = fakeAnalysisRepository();
    const service = createIncidentIntelligenceService({
      analysisRepository: repository,
      events: fakeEvents(),
      client: { provider: 'GEMINI', model: 'test-model', generateStructured: async () => { throw new GeminiClientError('AI_TIMEOUT', 'timeout', { transient: true, attempts: 3 }); } },
    });
    const result = await service.analyzeEvent(canonicalEvent());
    assert.equal(result.status, 'FAILED');
    assert.equal(result.errorCode, 'AI_TIMEOUT');
  });
});

test('structured sensor events use deterministic rules without Gemini', async () => {
  const repository = fakeAnalysisRepository();
  let geminiCalls = 0;
  const service = createIncidentIntelligenceService({
    analysisRepository: repository,
    events: fakeEvents(),
    client: { provider: 'GEMINI', model: 'test-model', generateStructured: async () => { geminiCalls += 1; } },
  });
  const result = await service.analyzeEvent(canonicalEvent({
    eventType: 'SENSOR_READING', source: 'SENSOR', payload: { readingType: 'critical_gas', smokePpm: 210, temperature: 91 },
  }));
  assert.equal(result.status, 'COMPLETED');
  assert.equal(repository.state.completed.candidate.incidentType, 'FIRE');
  assert.equal(geminiCalls, 0);
});

test('EVENT_RECEIVED triggers detached AI processing after event persistence', { skip: !databaseEnabled }, async () => {
  await prisma.$connect();
  await prisma.event.deleteMany({ where: { eventId: { startsWith: 'TEST-P05-' } } });
  const service = createIncidentIntelligenceService({
    client: { provider: 'GEMINI', model: 'test-model', generateStructured: async () => ({ output: validOutput(), attempts: 1 }) },
  });
  const unsubscribe = registerIncidentIntelligenceSubscriber({ service });
  const ingestion = createEventIngestionService({ repository: eventRepository, eventBus: domainEventBus });
  try {
    const ingested = await ingestion.ingest({
      eventId: 'TEST-P05-ASYNC-001', source: 'CITIZEN', eventType: 'EMERGENCY_REPORT',
      payload: { text: 'Warehouse fire with people possibly trapped.' }, location: { lat: 23.041, lng: 72.581 },
    });
    assert.equal(ingested.created, true);

    let analysis;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      analysis = await aiAnalysisRepository.findByEventId(ingested.event.id);
      if (analysis?.status === 'COMPLETED') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(analysis.status, 'COMPLETED');
    assert.equal(analysis.candidate.incidentType, 'FIRE');
    const event = await eventRepository.findByEventId('TEST-P05-ASYNC-001');
    assert.equal(event.processingStatus, 'PROCESSED');
  } finally {
    unsubscribe();
    await prisma.event.deleteMany({ where: { eventId: { startsWith: 'TEST-P05-' } } });
    await prisma.$disconnect();
  }
});
