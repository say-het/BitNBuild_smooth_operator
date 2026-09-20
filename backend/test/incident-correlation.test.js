import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { incidentCorrelationService } from '../src/services/incidents/incident-correlation-service.js';
import { scoreCorrelation } from '../src/services/incidents/correlation-scorer.js';

const enabled = process.env.RUN_DATABASE_TESTS === 'true';
const eventIds = [];
const incidentIds = [];
const incidentExternalIds = [];

function candidateShape(overrides = {}) {
  return {
    incidentType: 'FIRE', title: 'Warehouse fire', summary: 'Flames and smoke at a warehouse',
    severity: 3, priority: 'P2', confidence: 0.9, estimatedVictims: 2,
    estimatedInjured: 1, estimatedTrapped: null, hazards: ['fire', 'smoke'],
    requiredCapabilities: ['fire_response', 'medical'], latitude: 23.041, longitude: 72.591,
    locationConfidence: 1, evidence: ['visible flames'], ...overrides,
  };
}

async function createCandidate(suffix, { source = 'CITIZEN', timestamp, candidate = {} } = {}) {
  const eventId = `TEST-P06-${suffix}`;
  eventIds.push(eventId);
  const event = await prisma.event.create({ data: {
    eventId, source, eventType: source === 'SENSOR' ? 'SENSOR_READING' : 'EMERGENCY_REPORT',
    timestamp, latitude: candidate.latitude ?? 23.041, longitude: candidate.longitude ?? 72.591,
    payload: source === 'SENSOR' ? { smokePpm: 190 } : { text: candidate.summary ?? 'Warehouse fire' },
    processingStatus: 'PROCESSED',
  } });
  await prisma.$executeRaw`UPDATE events SET location = ST_SetSRID(ST_MakePoint(${Number(event.longitude)}, ${Number(event.latitude)}), 4326)::geography WHERE id = ${event.id}::uuid`;
  const analysis = await prisma.aIAnalysis.create({ data: {
    analysisId: `AI-${eventId}`, eventId: event.id, analysisType: 'INCIDENT_INTELLIGENCE',
    provider: 'TEST', model: 'test', status: 'COMPLETED', result: candidateShape(candidate),
  } });
  const data = candidateShape(candidate);
  const persisted = await prisma.incidentCandidate.create({ data: {
    candidateId: `IC-${eventId}`, eventId: event.id, analysisId: analysis.id,
    ...data,
  } });
  return { event, candidate: persisted };
}

async function cleanup() {
  if (incidentExternalIds.length) await prisma.auditLog.deleteMany({ where: { entityId: { in: incidentExternalIds }, action: 'INCIDENT_STATE_CHANGED' } });
  if (incidentIds.length) await prisma.incident.deleteMany({ where: { id: { in: incidentIds } } });
  await prisma.event.deleteMany({ where: { eventId: { startsWith: 'TEST-P06-' } } });
  incidentExternalIds.length = 0;
  incidentIds.length = 0;
  eventIds.length = 0;
}

test('correlation scoring is explainable and rejects type mismatch', () => {
  const same = scoreCorrelation(candidateShape(), {
    type: 'FIRE', title: 'Warehouse fire', summary: 'Smoke and flames at warehouse', hazards: ['fire', 'smoke'],
    requiredCapabilities: ['fire_response'], distanceMeters: 120, timeDifferenceSeconds: 30,
  });
  assert.equal(same.decision, 'CORRELATED');
  assert.ok(same.matchedSignals.includes('nearby'));
  assert.ok(same.matchedSignals.includes('same_type'));
  const mismatch = scoreCorrelation(candidateShape({ incidentType: 'FLOOD' }), {
    type: 'FIRE', title: 'Warehouse fire', summary: 'Smoke and flames at warehouse', hazards: ['fire'],
    requiredCapabilities: ['fire_response'], distanceMeters: 10, timeDifferenceSeconds: 5,
  });
  assert.notEqual(mismatch.decision, 'CORRELATED');
});

test('PostGIS correlation, deduplication, aggregation, reprocessing, state, and APIs', { skip: !enabled }, async () => {
  const app = createApp();
  await prisma.$connect();
  await cleanup();
  const baseTime = new Date('2026-09-19T11:00:00.000Z');
  try {
    const first = await createCandidate('FIRST', { timestamp: baseTime });
    const created = await incidentCorrelationService.correlate(first);
    incidentIds.push(created.incident.id);
    incidentExternalIds.push(created.incident.incidentId);
    assert.equal(created.action, 'NEW_INCIDENT');

    const corroborating = await createCandidate('SENSOR', {
      source: 'SENSOR', timestamp: new Date(baseTime.getTime() + 30_000),
      candidate: { title: 'Fire sensor anomaly', summary: 'Smoke sensor confirms warehouse fire', severity: 4, priority: 'P1', estimatedVictims: 5, estimatedTrapped: 3, hazards: ['fire', 'smoke', 'gas'], requiredCapabilities: ['fire_response', 'medical', 'hazmat'] },
    });
    const matched = await incidentCorrelationService.correlate(corroborating);
    assert.equal(matched.incident.id, created.incident.id);
    assert.equal(matched.relationshipType, 'CORROBORATING_SIGNAL');
    assert.ok(matched.correlation.score >= 0.7);

    const duplicate = await createCandidate('DUPLICATE', { timestamp: new Date(baseTime.getTime() + 45_000) });
    const duplicateResult = await incidentCorrelationService.correlate(duplicate);
    assert.equal(duplicateResult.incident.id, created.incident.id);
    assert.equal(duplicateResult.relationshipType, 'DUPLICATE');

    const reprocessed = await incidentCorrelationService.correlate(duplicate);
    assert.equal(reprocessed.incident.id, created.incident.id);
    assert.equal(reprocessed.reprocessed, true);

    const mismatch = await createCandidate('FLOOD', { timestamp: new Date(baseTime.getTime() + 60_000), candidate: { incidentType: 'FLOOD', title: 'Street flooding', summary: 'Water rising across the road', hazards: ['floodwater'], requiredCapabilities: ['water_rescue'], severity: 3 } });
    const separate = await incidentCorrelationService.correlate(mismatch);
    incidentIds.push(separate.incident.id);
    incidentExternalIds.push(separate.incident.incidentId);
    assert.notEqual(separate.incident.id, created.incident.id);

    const late = await createCandidate('LATE', { timestamp: new Date(baseTime.getTime() + 2 * 60 * 60 * 1000) });
    const temporallySeparate = await incidentCorrelationService.correlate(late);
    incidentIds.push(temporallySeparate.incident.id);
    incidentExternalIds.push(temporallySeparate.incident.incidentId);
    assert.notEqual(temporallySeparate.incident.id, created.incident.id);

    const refreshed = await prisma.incident.findUniqueOrThrow({ where: { id: created.incident.id }, include: { events: true, requiredCapabilities: { include: { capability: true } } } });
    assert.equal(refreshed.severity, 4);
    assert.equal(refreshed.estimatedVictims, 5);
    assert.equal(refreshed.estimatedTrapped, 3);
    assert.ok(refreshed.hazards.includes('gas'));
    assert.equal(refreshed.events.length, 3);

    await request(app).get(`/api/v1/incidents/${refreshed.incidentId}`).expect(200);
    const timeline = await request(app).get(`/api/v1/incidents/${refreshed.incidentId}/events`).expect(200);
    assert.equal(timeline.body.meta.count, 3);
    assert.ok(timeline.body.data[1].correlation.matchedSignals.length > 0);

    await request(app).post(`/api/v1/incidents/${refreshed.incidentId}/transition`).send({ status: 'ASSESSING', actorId: 'test-operator' }).expect(200);
    const invalid = await request(app).post(`/api/v1/incidents/${refreshed.incidentId}/transition`).send({ status: 'RESOLVED' }).expect(409);
    assert.equal(invalid.body.error.code, 'INVALID_INCIDENT_TRANSITION');
    const audits = await prisma.auditLog.findMany({ where: { entityId: refreshed.incidentId, action: 'INCIDENT_STATE_CHANGED' } });
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].previousState, { status: 'CREATED' });
    assert.deepEqual(audits[0].newState, { status: 'ASSESSING' });
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
