import assert from 'node:assert/strict';
import test from 'node:test';
import { createGeoService } from '../src/services/geo/geo-service.js';
import { createRoadStatusService } from '../src/services/geo/road-status-service.js';
import { createRoutingService } from '../src/services/routing/routing-service.js';

const clearRoads = {
  async getSnapshot() { return { version: 'roads-v1', roads: [] }; },
  assessRoute() { return { status: 'CLEAR', potentiallyImpacted: false, impactedRoads: [] }; },
};

function osrmResponse(overrides = {}) {
  return {
    ok: true,
    json: async () => ({
      code: 'Ok',
      routes: [{
        distance: 4_200.4,
        duration: 480.2,
        geometry: { type: 'LineString', coordinates: [[72.56, 23.02], [72.59, 23.04]] },
      }],
      ...overrides,
    }),
  };
}

test('OSRM route output is normalized and cached', async () => {
  let calls = 0;
  const service = createRoutingService({
    fetchImpl: async () => { calls += 1; return osrmResponse(); },
    roads: clearRoads,
  });
  const input = { origin: { lat: 23.02, lng: 72.56 }, destination: { lat: 23.04, lng: 72.59 } };
  const first = await service.getRoute(input);
  const second = await service.getRoute(input);
  assert.equal(first.provider, 'OSRM');
  assert.equal(first.estimated, false);
  assert.equal(first.distanceMeters, 4_200);
  assert.equal(first.durationSeconds, 480);
  assert.equal(first.etaMinutes, 8);
  assert.equal(first.geometry.type, 'LineString');
  assert.match(first.estimateBasis, /not live traffic/);
  assert.deepEqual(second, first);
  assert.equal(calls, 1);
});

test('OSRM timeout and malformed responses produce a valid fallback estimate', async (suite) => {
  await suite.test('timeout', async () => {
    const service = createRoutingService({
      timeoutMs: 5,
      roads: clearRoads,
      fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }),
    });
    const route = await service.getRoute({
      origin: { lat: 23.02, lng: 72.56 }, destination: { lat: 23.04, lng: 72.59 },
    });
    assert.equal(route.provider, 'FALLBACK');
    assert.equal(route.estimated, true);
    assert.ok(route.distanceMeters > 0);
    assert.ok(route.durationSeconds > 0);
  });

  await suite.test('malformed response', async () => {
    const service = createRoutingService({
      roads: clearRoads,
      fetchImpl: async () => osrmResponse({ routes: [{ distance: 'far', geometry: null }] }),
    });
    const route = await service.getRoute({
      origin: { lat: 23.02, lng: 72.56 }, destination: { lat: 23.04, lng: 72.59 },
    });
    assert.equal(route.provider, 'FALLBACK');
  });
});

test('route validation rejects missing and invalid coordinates', async () => {
  const service = createRoutingService({ roads: clearRoads, fetchImpl: async () => assert.fail('must not call') });
  await assert.rejects(service.getRoute({ destination: { lat: 23, lng: 72 } }), /Invalid origin/);
  await assert.rejects(service.getRoute({
    origin: { lat: 91, lng: 72 }, destination: { lat: 23, lng: 72 },
  }), /Invalid origin/);
  await assert.rejects(service.getRoute({
    origin: { lat: 23, lng: 181 }, destination: { lat: 23, lng: 72 },
  }), /Invalid origin/);
});

test('OSRM table ranks resource candidates without sequential route calls', async () => {
  let calls = 0;
  const service = createRoutingService({
    roads: clearRoads,
    fetchImpl: async (url) => {
      calls += 1;
      assert.match(url, /\/table\/v1\/driving\//);
      return {
        ok: true,
        json: async () => ({ code: 'Ok', durations: [[600], [300]], distances: [[5_000], [3_000]] }),
      };
    },
  });
  const ranked = await service.rankByTravelTime({
    resources: [
      { resourceId: 'RES-1', type: 'FIRE_TRUCK', location: { lat: 23.01, lng: 72.55 } },
      { resourceId: 'RES-2', type: 'FIRE_TRUCK', location: { lat: 23.03, lng: 72.58 } },
    ],
    destination: { lat: 23.04, lng: 72.59 },
  });
  assert.deepEqual(ranked.map(({ resource }) => resource.resourceId), ['RES-2', 'RES-1']);
  assert.deepEqual(ranked.map(({ route }) => route.etaMinutes), [5, 10]);
  assert.equal(calls, 1);
});

test('geo service preserves PostGIS ordering and internal candidate contract', async () => {
  const calls = [];
  const repository = {
    async findNearbyResources(input) {
      calls.push(input);
      return [{
        resourceId: 'RES-WATER', name: 'Water Rescue', type: 'RESCUE_TEAM', status: 'AVAILABLE',
        latitude: '23.01', longitude: '72.58', distanceMeters: 123.6,
        capabilities: [{ code: 'water_rescue', name: 'Water rescue', proficiency: 1 }],
      }];
    },
  };
  const service = createGeoService({ repository });
  const results = await service.findCandidateResources({
    incidentLocation: { lat: 23.012, lng: 72.581 },
    requiredCapabilities: ['water_rescue'],
    radiusMeters: 5_000,
  });
  assert.equal(results[0].distanceMeters, 124);
  assert.deepEqual(results[0].location, { lat: 23.01, lng: 72.58 });
  assert.deepEqual(calls[0].capabilities, ['water_rescue']);
  assert.equal(calls[0].status, 'AVAILABLE');
});

test('known blocked roads can mark route geometry as potentially impacted', async () => {
  const service = createRoadStatusService({
    roads: [{ roadId: 'ROAD-1', name: 'Test Road', status: 'OPEN', geometry: [[0, 1], [2, 1]] }],
    repository: {
      async findLatestUpdates() {
        return [{ timestamp: new Date('2026-09-19T10:00:00Z'), payload: { roadId: 'ROAD-1', status: 'CLOSED' } }];
      },
    },
  });
  const snapshot = await service.getSnapshot();
  const result = service.assessRoute({ type: 'LineString', coordinates: [[1, 0], [1, 2]] }, snapshot);
  assert.equal(result.potentiallyImpacted, true);
  assert.equal(result.impactedRoads[0].roadId, 'ROAD-1');
});
