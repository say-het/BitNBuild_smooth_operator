import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { EventScheduler } from '../src/services/simulator/eventScheduler.js';
import { generateSourceEvent } from '../src/services/simulator/eventGenerator.js';
import { instantiateScenario } from '../src/services/simulator/scenarioEngine.js';
import { scenarioRegistry } from '../src/services/simulator/scenarioRegistry.js';
import { SeededRandom } from '../src/services/simulator/seededRandom.js';
import { SimulationClock } from '../src/services/simulator/simulationClock.js';

const databaseEnabled = process.env.RUN_DATABASE_TESTS === 'true';

test('scenario registry, deterministic truth, and correlated timelines', async (suite) => {
  await suite.test('registers all four scenarios', () => {
    assert.deepEqual(scenarioRegistry.list().map(({ id }) => id).sort(), [
      'EARTHQUAKE', 'FLOOD', 'INDUSTRIAL_FIRE', 'ROAD_ACCIDENT',
    ]);
  });

  for (const scenarioId of ['INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE']) {
    await suite.test(`${scenarioId} is reproducible and produces valid truth`, () => {
      const first = instantiateScenario(scenarioId, 42);
      const second = instantiateScenario(scenarioId, 42);
      assert.deepEqual(first.groundTruth, second.groundTruth);
      assert.deepEqual(first.timeline, second.timeline);
      assert.ok(first.timeline.length >= 10);
      assert.ok(first.groundTruth.every((truth) => truth.severity >= 1 && truth.severity <= 5));
      assert.ok(first.timeline.filter(({ incident }) => incident === 0).length > 1);
    });
  }

  await suite.test('earthquake preserves distinct incidents under one scenario', () => {
    const { groundTruth, timeline } = instantiateScenario('EARTHQUAKE', 42);
    assert.equal(groundTruth.length, 3);
    assert.deepEqual([...new Set(timeline.map(({ incident }) => incident))], [0, 1, 2]);
  });
});

test('simulation clock supports scale, pause, resume, stop, and step', () => {
  let realTime = 1_000;
  const clock = new SimulationClock({ timeScale: 10, now: () => realTime });
  clock.start();
  realTime += 500;
  assert.equal(clock.getElapsedTime(), 5);
  clock.pause();
  realTime += 1_000;
  assert.equal(clock.getCurrentTime(), 5);
  clock.resume();
  realTime += 200;
  assert.equal(clock.getElapsedTime(), 7);
  assert.equal(clock.step(3), 10);
  clock.stop();
  realTime += 1_000;
  assert.equal(clock.getElapsedTime(), 10);
});

test('event scheduler orders, executes once, and cancels pending work', () => {
  const scheduler = new EventScheduler([
    { at: 20, order: 1, id: 'late' },
    { at: 10, order: 0, id: 'early' },
    { at: 20, order: 2, id: 'same-time' },
  ]);
  assert.deepEqual(scheduler.takeDue(19).map(({ id }) => id), ['early']);
  assert.deepEqual(scheduler.takeDue(20).map(({ id }) => id), ['late', 'same-time']);
  assert.equal(scheduler.takeNext(), undefined);
  scheduler.cancel();
  assert.equal(scheduler.peek(), undefined);
});

test('all synthetic sources generate canonical-compatible observations', () => {
  const scenario = instantiateScenario('INDUSTRIAL_FIRE', 42);
  const contexts = scenario.timeline.map((timelineEvent, index) => ({
    runId: 'SIM-TEST', scenario: 'INDUSTRIAL_FIRE', sequence: index + 1, timelineEvent,
    truth: scenario.groundTruth[timelineEvent.incident], resources: [{ resourceId: 'RES-FIRE-01', status: 'AVAILABLE' }],
    hospitals: [{ hospitalId: 'HSP-001', status: 'OPERATIONAL', availableBeds: 20, availableEmergencyCapacity: 8 }],
    random: new SeededRandom(100 + index), now: () => new Date('2026-09-19T10:00:00.000Z'),
  }));
  const generated = contexts.map(generateSourceEvent);
  assert.deepEqual([...new Set(generated.map(({ source }) => source))].sort(), [
    'CITIZEN', 'EMERGENCY_CALL', 'FIELD_TEAM', 'GOVERNMENT', 'HOSPITAL', 'SENSOR', 'WEATHER',
  ]);
  assert.ok(generated.every((event) => event.metadata.synthetic === true));
  assert.ok(generated.every((event) => !Object.hasOwn(event.payload, 'groundTruth')));
});

test('simulation API and real ingestion integration', { skip: !databaseEnabled }, async () => {
  const app = createApp();
  const runIds = [];
  await prisma.$connect();
  try {
    for (const scenario of ['INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE']) {
      const created = await request(app).post('/api/v1/simulations').send({ scenario, seed: 42, timeScale: 20 }).expect(201);
      runIds.push(created.body.data.runId);
      assert.equal(created.body.data.status, 'CREATED');
      assert.equal(created.body.data.groundTruth, undefined);
    }

    await request(app).post('/api/v1/simulations').send({ scenario: 'TORNADO', seed: 1, timeScale: 1 }).expect(400);
    await request(app).post('/api/v1/simulations').send({ scenario: 'FLOOD', seed: 1, timeScale: 2 }).expect(400);
    await request(app).get('/api/v1/simulations/SIM-NOT-FOUND').expect(404);

    const listed = await request(app).get('/api/v1/simulations').expect(200);
    assert.ok(listed.body.data.some(({ runId }) => runIds.includes(runId)));

    const lifecycleId = runIds[1];
    await request(app).post(`/api/v1/simulations/${lifecycleId}/start`).expect(200);
    await request(app).post(`/api/v1/simulations/${lifecycleId}/start`).expect(409);
    await request(app).post(`/api/v1/simulations/${lifecycleId}/pause`).expect(200);
    await request(app).post(`/api/v1/simulations/${lifecycleId}/resume`).expect(200);
    await request(app).post(`/api/v1/simulations/${lifecycleId}/resume`).expect(409);
    await request(app).post(`/api/v1/simulations/${lifecycleId}/stop`).expect(200);

    const steppedId = runIds[0];
    let result;
    do {
      result = await request(app).post(`/api/v1/simulations/${steppedId}/step`).expect(200);
    } while (result.body.data.status !== 'COMPLETED');
    assert.equal(result.body.data.eventsGenerated, 13);

    const persisted = await prisma.event.findMany({ where: { eventId: { startsWith: steppedId } } });
    assert.equal(persisted.length, 13);
    assert.ok(persisted.every(({ processingStatus }) => processingStatus === 'RECEIVED'));
    const truthCount = await prisma.simulationGroundTruthIncident.count({ where: { simulationRun: { runId: steppedId } } });
    assert.equal(truthCount, 1);

    const detail = await request(app).get(`/api/v1/simulations/${steppedId}`).expect(200);
    assert.equal(detail.body.data.groundTruth, undefined);
    assert.equal(detail.body.data.worldState, undefined);
  } finally {
    for (const runId of runIds) {
      await prisma.event.deleteMany({ where: { eventId: { startsWith: runId } } });
    }
    await prisma.simulationRun.deleteMany({ where: { runId: { in: runIds } } });
    await prisma.$disconnect();
  }
});
