import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../src/db/prisma.js';
import { alertRepository } from '../src/repositories/alertRepository.js';
import { assignmentRepository } from '../src/repositories/assignmentRepository.js';
import { auditRepository } from '../src/repositories/auditRepository.js';
import { eventRepository } from '../src/repositories/eventRepository.js';
import { geoRepository } from '../src/repositories/geoRepository.js';
import { hospitalRepository } from '../src/repositories/hospitalRepository.js';
import { incidentRepository } from '../src/repositories/incidentRepository.js';
import { resourceRepository } from '../src/repositories/resourceRepository.js';
import { sensorRepository } from '../src/repositories/sensorRepository.js';

const enabled = process.env.RUN_DATABASE_TESTS === 'true';

async function cleanup() {
  await prisma.alert.deleteMany({ where: { alertId: { startsWith: 'TEST-' } } });
  await prisma.resourceAssignment.deleteMany({ where: { assignmentId: { startsWith: 'TEST-' } } });
  await prisma.incidentEvent.deleteMany({
    where: { incident: { incidentId: { startsWith: 'TEST-' } } },
  });
  await prisma.incidentCapability.deleteMany({
    where: { incident: { incidentId: { startsWith: 'TEST-' } } },
  });
  await prisma.sensorReading.deleteMany({ where: { readingId: { startsWith: 'TEST-' } } });
  await prisma.auditLog.deleteMany({ where: { auditId: { startsWith: 'TEST-' } } });
  await prisma.resourceCapability.deleteMany({
    where: { resource: { resourceId: { startsWith: 'TEST-' } } },
  });
  await prisma.sensor.deleteMany({ where: { sensorId: { startsWith: 'TEST-' } } });
  await prisma.resource.deleteMany({ where: { resourceId: { startsWith: 'TEST-' } } });
  await prisma.hospital.deleteMany({ where: { hospitalId: { startsWith: 'TEST-' } } });
  await prisma.incident.deleteMany({ where: { incidentId: { startsWith: 'TEST-' } } });
  await prisma.event.deleteMany({ where: { eventId: { startsWith: 'TEST-' } } });
}

test('PostgreSQL/PostGIS repository integration', { skip: !enabled }, async (suite) => {
  await prisma.$connect();
  await cleanup();

  try {
    let event;
    let incident;
    let resource;

    await suite.test('creates, retrieves, and advances a uniquely identified event', async () => {
      event = await eventRepository.create({
        eventId: 'TEST-EV-001',
        source: 'CITIZEN',
        eventType: 'EMERGENCY_REPORT',
        timestamp: new Date('2026-09-19T09:00:00.000Z'),
        location: { lat: 23.0225, lng: 72.5714 },
        payload: { text: 'Integration fixture' },
      });
      const retrieved = await eventRepository.findByEventId('TEST-EV-001');
      assert.equal(retrieved.id, event.id);
      assert.equal(retrieved.processingStatus, 'RECEIVED');

      const processed = await eventRepository.updateProcessingStatus('TEST-EV-001', 'PROCESSED');
      assert.equal(processed.processingStatus, 'PROCESSED');
      await assert.rejects(
        eventRepository.create({
          eventId: 'TEST-EV-001',
          source: 'SYSTEM',
          eventType: 'SYSTEM_ALERT',
          timestamp: new Date(),
          payload: {},
        }),
        (error) => error.code === 'P2002',
      );
    });

    await suite.test('creates an incident with capability and event relationship', async () => {
      incident = await incidentRepository.create({
        incidentId: 'TEST-INC-001',
        type: 'FIRE',
        severity: 4,
        priority: 'P1',
        status: 'ASSESSING',
        confidence: 0.91,
        title: 'Integration fire incident',
        hazards: ['smoke'],
        detectedAt: new Date('2026-09-19T09:01:00.000Z'),
        location: { lat: 23.023, lng: 72.572 },
        requiredCapabilityCodes: ['fire_response'],
      });
      await incidentRepository.linkEvent(incident.id, event.id, 'PRIMARY_SIGNAL', 0.91);
      const retrieved = await incidentRepository.findByIncidentId('TEST-INC-001');
      assert.equal(retrieved.status, 'ASSESSING');
      assert.equal(retrieved.severity, 4);
      assert.equal(retrieved.priority, 'P1');
      assert.equal(retrieved.events[0].event.eventId, 'TEST-EV-001');
      assert.equal(retrieved.requiredCapabilities[0].capability.code, 'fire_response');
    });

    await suite.test('creates a geospatial resource with normalized capabilities', async () => {
      resource = await resourceRepository.create({
        resourceId: 'TEST-RES-001',
        name: 'Integration Fire Unit',
        type: 'FIRE_TRUCK',
        status: 'AVAILABLE',
        location: { lat: 23.021, lng: 72.57 },
        capacity: { crew: 5 },
        capabilityCodes: ['fire_response', 'heavy_rescue'],
      });
      const retrieved = await resourceRepository.findByResourceId('TEST-RES-001');
      assert.equal(retrieved.status, 'AVAILABLE');
      assert.deepEqual(
        retrieved.capabilities.map(({ capability }) => capability.code).sort(),
        ['fire_response', 'heavy_rescue'],
      );
      const nearby = await geoRepository.findNearbyResources(23.0225, 72.5714, 2_000);
      assert.ok(nearby.some((item) => item.resourceId === 'TEST-RES-001'));
    });

    await suite.test('preserves assignment history and relationship integrity', async () => {
      const first = await assignmentRepository.create({
        assignmentId: 'TEST-ASG-001',
        incidentId: incident.id,
        resourceId: resource.id,
        status: 'ASSIGNED',
        assignmentReason: 'Closest suitable fire unit',
      });
      await assignmentRepository.updateStatus(first.assignmentId, 'CANCELLED', {
        completedAt: new Date('2026-09-19T09:05:00.000Z'),
      });
      await assignmentRepository.create({
        assignmentId: 'TEST-ASG-002',
        incidentId: incident.id,
        resourceId: resource.id,
        status: 'ASSIGNED',
        assignmentReason: 'Reassignment history fixture',
      });
      const history = await assignmentRepository.findIncidentHistory(incident.id);
      assert.equal(history.length, 2);
      assert.deepEqual(history.map(({ assignmentId }) => assignmentId), ['TEST-ASG-001', 'TEST-ASG-002']);
    });

    await suite.test('enforces hospital capacities and supports nearby lookup', async () => {
      const hospital = await hospitalRepository.create({
        hospitalId: 'TEST-HSP-001',
        name: 'Integration Hospital',
        status: 'OPERATIONAL',
        location: { lat: 23.025, lng: 72.575 },
        totalBeds: 100,
        availableBeds: 25,
        icuBeds: 10,
        availableIcuBeds: 3,
        emergencyCapacity: 12,
        availableEmergencyCapacity: 4,
        ambulanceCapacity: 5,
      });
      assert.equal(hospital.availableBeds, 25);
      const nearby = await geoRepository.findNearbyHospitals(23.0225, 72.5714, 2_000);
      assert.ok(nearby.some((item) => item.hospitalId === 'TEST-HSP-001'));
      await assert.rejects(
        hospitalRepository.updateCapacity('TEST-HSP-001', { availableBeds: 101 }),
        /hospitals_capacity_check/,
      );
    });

    await suite.test('stores indexed sensor readings and updates observation time', async () => {
      const sensor = await sensorRepository.create({
        sensorId: 'TEST-SNS-001',
        name: 'Integration Smoke Sensor',
        type: 'SMOKE',
        status: 'ACTIVE',
        unit: 'ppm',
        location: { lat: 23.024, lng: 72.573 },
      });
      const timestamp = new Date('2026-09-19T09:10:00.000Z');
      await sensorRepository.createReading({
        readingId: 'TEST-RDG-001',
        sensorId: sensor.id,
        timestamp,
        value: 81.5,
        unit: 'ppm',
        quality: 'GOOD',
      });
      const readings = await sensorRepository.findReadings(sensor.id);
      const refreshed = await sensorRepository.findBySensorId('TEST-SNS-001');
      assert.equal(readings.length, 1);
      assert.equal(refreshed.lastReadingAt.toISOString(), timestamp.toISOString());
    });

    await suite.test('creates, acknowledges, and resolves an alert', async () => {
      const alert = await alertRepository.create({
        alertId: 'TEST-ALT-001',
        type: 'CRITICAL_INCIDENT',
        severity: 4,
        title: 'Integration alert',
        message: 'Repository lifecycle verification',
        incidentId: incident.id,
      });
      assert.equal(alert.status, 'ACTIVE');
      const acknowledged = await alertRepository.acknowledge(alert.alertId);
      assert.equal(acknowledged.status, 'ACKNOWLEDGED');
      const resolved = await alertRepository.resolve(alert.alertId);
      assert.equal(resolved.status, 'RESOLVED');
      assert.ok(resolved.resolvedAt);
    });

    await suite.test('creates a reconstructable audit record', async () => {
      await auditRepository.create({
        auditId: 'TEST-AUD-001',
        actorType: 'OPERATOR',
        actorId: 'test-operator',
        action: 'INCIDENT_REVIEWED',
        entityType: 'Incident',
        entityId: incident.incidentId,
        previousState: { status: 'CREATED' },
        newState: { status: 'ASSESSING' },
      });
      const records = await auditRepository.findForEntity('Incident', incident.incidentId);
      assert.equal(records.length, 1);
      assert.equal(records[0].action, 'INCIDENT_REVIEWED');
    });
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
