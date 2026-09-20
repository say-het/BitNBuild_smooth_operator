import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/db/prisma.js';
import {
  findNearbyHospitals,
  findNearbyIncidents,
  findNearbyResources,
  getRoute,
} from '../src/controllers/geo.controller.js';
import { geoService } from '../src/services/geo/geo-service.js';

const enabled = process.env.RUN_DATABASE_TESTS === 'true';

test('geo API validation rejects invalid coordinates and radii', async () => {
  const invalid = [
    () => findNearbyResources({ query: { lat: '91', lng: '72', radius: '5000' } }, {}),
    () => findNearbyHospitals({ query: { lat: '23', lng: '181', radius: '5000' } }, {}),
    () => findNearbyIncidents({ query: { lat: '23', lng: '72', radius: '-1' } }, {}),
    () => findNearbyResources({ query: { lat: '23', lng: '72', radius: '200001' } }, {}),
    () => getRoute({ body: { origin: { lat: 23, lng: 72 } } }, {}),
  ];
  for (const operation of invalid) {
    await assert.rejects(operation, (error) => error.code === 'VALIDATION_ERROR');
  }
});

test('seeded PostGIS nearby queries filter and sort operational entities', { skip: !enabled }, async () => {
  await prisma.$connect();
  try {
    const resources = await geoService.findNearbyResources({
      lat: 23.0301,
      lng: 72.5582,
      radiusMeters: 10_000,
      capabilities: ['medical'],
      status: 'AVAILABLE',
    });
    assert.ok(resources.some(({ resourceId }) => resourceId === 'RES-AMB-01'));
    assert.ok(resources.every(({ status }) => status === 'AVAILABLE'));
    assert.ok(resources.every(({ capabilities }) => capabilities.some(({ code }) => code === 'medical')));
    assert.deepEqual(
      resources.map(({ distanceMeters }) => distanceMeters),
      [...resources.map(({ distanceMeters }) => distanceMeters)].sort((left, right) => left - right),
    );

    const narrow = await geoService.findNearbyResources({
      lat: 23.0301, lng: 72.5582, radiusMeters: 50, status: 'AVAILABLE',
    });
    assert.deepEqual(narrow.map(({ resourceId }) => resourceId), ['RES-AMB-01']);

    const hospitals = await geoService.findNearbyHospitals({
      lat: 23.0263, lng: 72.5585, radiusMeters: 5_000, operationalOnly: true,
    });
    assert.ok(hospitals.some(({ hospitalId }) => hospitalId === 'HSP-002'));
    assert.ok(hospitals.every(({ status }) => status === 'OPERATIONAL'));

    const incidents = await geoService.findNearbyIncidents({
      lat: 23.0391, lng: 72.5941, radiusMeters: 1_000,
    });
    assert.ok(incidents.some(({ incidentId }) => incidentId === 'INC-SEED-001'));
  } finally {
    await prisma.$disconnect();
  }
});
