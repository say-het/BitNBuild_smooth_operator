import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { domainEventBus } from '../src/events/domain-event-bus.js';
import { ValidationError } from '../src/errors/application-error.js';
import { normalizeEvent } from '../src/services/events/event-normalizer.js';

const enabled = process.env.RUN_DATABASE_TESTS === 'true';
const fixedNow = new Date('2026-09-19T10:30:02.125Z');

function baseEvent(overrides = {}) {
  return {
    eventId: 'TEST-P03-EV-001',
    source: 'CITIZEN',
    eventType: 'EMERGENCY_REPORT',
    timestamp: '2026-09-19T10:30:00.000Z',
    location: { lat: 23.0225, lng: 72.5714, accuracyMeters: 15 },
    payload: { text: 'Fire near warehouse', language: 'en' },
    metadata: { sourceId: 'citizen-test-device' },
    ...overrides,
  };
}

test('canonical normalization is deterministic across source formats', async (suite) => {
  const clock = () => fixedNow;

  await suite.test('normalizes a citizen report and preserves its payload', () => {
    const event = normalizeEvent(baseEvent(), { now: clock });
    assert.equal(event.eventId, 'TEST-P03-EV-001');
    assert.equal(event.source, 'CITIZEN');
    assert.equal(event.eventType, 'EMERGENCY_REPORT');
    assert.deepEqual(event.payload, { text: 'Fire near warehouse', language: 'en' });
    assert.deepEqual(event.location, { lat: 23.0225, lng: 72.5714, accuracyMeters: 15 });
    assert.equal(event.metadata.schemaVersion, '1.0');
  });

  await suite.test('normalizes sensor GeoJSON coordinates', () => {
    const event = normalizeEvent(
      baseEvent({
        eventId: undefined,
        source: 'SENSOR',
        eventType: 'SENSOR_READING',
        geometry: { type: 'Point', coordinates: [72.58, 23.03] },
        location: undefined,
        payload: { temperature: 92, smokeLevel: 0.87, unit: 'C' },
      }),
      { now: clock },
    );
    assert.match(event.eventId, /^EV-[0-9A-F-]{36}$/);
    assert.deepEqual(event.location, { lat: 23.03, lng: 72.58 });
    assert.equal(event.payload.temperature, 92);
  });

  await suite.test('normalizes a field-team update', () => {
    const event = normalizeEvent(
      baseEvent({
        source: 'FIELD_TEAM',
        eventType: 'FIELD_UPDATE',
        location: undefined,
        latitude: 23.04,
        longitude: 72.59,
        payload: { resourceId: 'RES-001', status: 'ON_SCENE' },
      }),
      { now: clock },
    );
    assert.equal(event.payload.resourceId, 'RES-001');
    assert.deepEqual(event.location, { lat: 23.04, lng: 72.59 });
  });

  await suite.test('falls back missing source time to receive time and records it', () => {
    const event = normalizeEvent(baseEvent({ timestamp: undefined }), { now: clock });
    assert.equal(event.timestamp.toISOString(), fixedNow.toISOString());
    assert.equal(event.metadata.timestampFallback, 'receivedAt');
  });

  const invalidInputs = [
    ['missing source', baseEvent({ source: undefined })],
    ['missing event type', baseEvent({ eventType: undefined })],
    ['invalid timestamp', baseEvent({ timestamp: 'not-a-date' })],
    ['invalid coordinates', baseEvent({ location: { lat: 91, lng: 72 } })],
    ['missing payload', (() => { const value = baseEvent(); delete value.payload; return value; })()],
    ['malformed payload', baseEvent({ payload: ['not', 'an', 'object'] })],
  ];

  for (const [name, input] of invalidInputs) {
    await suite.test(`rejects ${name}`, () => {
      assert.throws(() => normalizeEvent(input, { now: clock }), ValidationError);
    });
  }
});

test('event ingestion API and persistence', { skip: !enabled }, async (suite) => {
  const app = createApp();
  const generatedIds = [];
  await prisma.$connect();
  await prisma.event.deleteMany({ where: { eventId: { startsWith: 'TEST-P03-' } } });

  try {
    const received = [];
    const unsubscribe = domainEventBus.subscribe('EVENT_RECEIVED', (event) => received.push(event));

    await suite.test('creates an event, emits once after persistence, and retrieves it', async () => {
      const created = await request(app).post('/api/v1/events').send(baseEvent()).expect(201);
      assert.deepEqual(created.body.data, {
        eventId: 'TEST-P03-EV-001',
        status: 'RECEIVED',
        duplicate: false,
      });
      assert.equal(received.length, 1);
      assert.equal(received[0].eventId, 'TEST-P03-EV-001');

      const detail = await request(app).get('/api/v1/events/TEST-P03-EV-001').expect(200);
      assert.equal(detail.body.data.payload.text, 'Fire near warehouse');
      assert.equal(detail.body.data.location.accuracyMeters, 15);
      assert.equal(detail.body.data.metadata.sourceId, 'citizen-test-device');
      assert.equal(detail.body.data.processingStatus, 'RECEIVED');
    });

    await suite.test('handles duplicate submission idempotently', async () => {
      const duplicate = await request(app).post('/api/v1/events').send(baseEvent()).expect(200);
      assert.equal(duplicate.body.data.duplicate, true);
      assert.equal(received.length, 1);
      assert.equal(await prisma.event.count({ where: { eventId: 'TEST-P03-EV-001' } }), 1);
    });

    await suite.test('generates an event ID and records timestamp fallback', async () => {
      const input = baseEvent({ eventId: undefined, timestamp: undefined });
      const created = await request(app).post('/api/v1/events').send(input).expect(201);
      assert.match(created.body.data.eventId, /^EV-[0-9A-F-]{36}$/);
      generatedIds.push(created.body.data.eventId);
      const detail = await request(app).get(`/api/v1/events/${created.body.data.eventId}`).expect(200);
      assert.equal(detail.body.data.metadata.timestampFallback, 'receivedAt');
    });

    await suite.test('supports filters and bounded pagination', async () => {
      await request(app)
        .post('/api/v1/events')
        .send(
          baseEvent({
            eventId: 'TEST-P03-EV-002',
            source: 'SENSOR',
            eventType: 'SENSOR_READING',
            payload: { temperature: 92, smokeLevel: 0.87 },
          }),
        )
        .expect(201);
      const list = await request(app)
        .get('/api/v1/events?source=SENSOR&eventType=SENSOR_READING&page=1&limit=1')
        .expect(200);
      assert.equal(list.body.meta.page, 1);
      assert.equal(list.body.meta.limit, 1);
      assert.ok(list.body.meta.total >= 1);
      assert.equal(list.body.data.length, 1);
      assert.equal(list.body.data[0].source, 'SENSOR');
    });

    const invalidRequests = [
      baseEvent({ eventId: 'TEST-P03-BAD-SOURCE', source: 'UNKNOWN' }),
      baseEvent({ eventId: 'TEST-P03-BAD-TYPE', eventType: 'FIRE' }),
      baseEvent({ eventId: 'TEST-P03-BAD-TIME', timestamp: 'tomorrow-ish' }),
      baseEvent({ eventId: 'TEST-P03-BAD-LOCATION', location: { lat: -91, lng: 0 } }),
      baseEvent({ eventId: 'TEST-P03-BAD-PAYLOAD', payload: 'private transcript' }),
    ];

    await suite.test('returns safe 400 errors without persistence for invalid events', async () => {
      for (const input of invalidRequests) {
        const result = await request(app).post('/api/v1/events').send(input).expect(400);
        assert.equal(result.body.error.code, 'VALIDATION_ERROR');
      }
      const invalidCount = await prisma.event.count({
        where: { eventId: { startsWith: 'TEST-P03-BAD-' } },
      });
      assert.equal(invalidCount, 0);
    });

    await suite.test('validates list filters and missing records', async () => {
      await request(app).get('/api/v1/events?limit=101').expect(400);
      const missing = await request(app).get('/api/v1/events/TEST-P03-NOT-FOUND').expect(404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
    });

    await suite.test('persists even when an internal listener fails', async () => {
      const stopFailingListener = domainEventBus.subscribe('EVENT_RECEIVED', () => {
        throw new Error('Expected listener test failure');
      });
      await request(app)
        .post('/api/v1/events')
        .send(baseEvent({ eventId: 'TEST-P03-EV-LISTENER' }))
        .expect(201);
      stopFailingListener();
      assert.equal(await prisma.event.count({ where: { eventId: 'TEST-P03-EV-LISTENER' } }), 1);
    });

    unsubscribe();
  } finally {
    await prisma.event.deleteMany({
      where: {
        OR: [
          { eventId: { startsWith: 'TEST-P03-' } },
          ...(generatedIds.length ? [{ eventId: { in: generatedIds } }] : []),
        ],
      },
    });
    await prisma.$disconnect();
  }
});
