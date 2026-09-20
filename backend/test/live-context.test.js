import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveContextService } from '../src/services/geo/live-context-service.js';

test('liveContextService uses preloaded facilities without hitting overpass API', async () => {
  const customFacilities = [
    { id: 'TEST-1', type: 'hospital', name: 'Test Hospital', location: { lat: 23.0225, lng: 72.5714 } },
    { id: 'TEST-2', type: 'school', name: 'Far School', location: { lat: 25.0, lng: 75.0 } },
  ];

  let fetchCount = 0;
  const mockFetch = async () => {
    fetchCount += 1;
    return { features: [], current: { temperature_2m: 30 } };
  };

  const service = createLiveContextService({
    fetchImpl: mockFetch,
    facilitiesData: customFacilities,
    now: () => 1000,
  });

  const result = await service.get({ lat: 23.0225, lng: 72.5714, radiusMeters: 5000 });
  assert.ok(result);
  assert.equal(result.sources.facilities, 'OPENSTREETMAP_FILE');
  assert.equal(result.facilities.length, 1);
  assert.equal(result.facilities[0].id, 'TEST-1');
  assert.equal(result.facilities[0].name, 'Test Hospital');

  // Verify caching
  const cachedResult = await service.get({ lat: 23.0225, lng: 72.5714, radiusMeters: 5000 });
  assert.equal(fetchCount, 3); // initial weather, earthquake, gdacs (no second fetch)
  assert.deepEqual(cachedResult.facilities, result.facilities);
});

test('liveContextService loads real saved facilities from osm-facilities.json by default', async () => {
  const { liveContextService } = await import('../src/services/geo/live-context-service.js');
  const mockFetch = async () => ({ features: [], current: {} });
  const service = createLiveContextService({ fetchImpl: mockFetch });
  const result = await service.get({ lat: 23.0225, lng: 72.5714, radiusMeters: 12000 });
  assert.ok(result.facilities.length > 0);
  assert.ok(result.facilities.some((f) => f.type === 'hospital'));
  assert.ok(result.facilities.some((f) => f.type === 'school'));
  assert.ok(result.facilities.some((f) => f.type === 'police'));
});
