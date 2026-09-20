import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/db/prisma.js';
import { createResponseOrchestrator } from '../src/services/orchestration/response-orchestrator.js';
import { createResourceLocationService } from '../src/services/resources/resource-location-service.js';

const enabled = process.env.RUN_DATABASE_TESTS === 'true';
const prefix = 'TEST-P09-';

const routing = {
  async getRoute() {
    return {
      routeId: 'TEST-P09-ROUTE',
      provider: 'integration-fixture',
      estimated: false,
      estimateBasis: null,
      distanceMeters: 1_200,
      durationSeconds: 300,
      geometry: { type: 'LineString', coordinates: [[72.57, 23.02], [72.58, 23.03]] },
      roadStatus: { closures: [], congestion: 'NORMAL' },
    };
  },
};

async function createIncident(id, status = 'RESOURCE_RECOMMENDED') {
  return prisma.incident.create({
    data: {
      incidentId: id,
      type: 'FIRE',
      severity: 4,
      priority: 'P1',
      status,
      title: `${id} orchestration fixture`,
      detectedAt: new Date('2026-09-19T10:00:00.000Z'),
      latitude: 23.03,
      longitude: 72.58,
    },
  });
}

async function createResource(id, status = 'AVAILABLE') {
  return prisma.resource.create({
    data: {
      resourceId: id,
      name: `${id} response unit`,
      type: 'FIRE_TRUCK',
      status,
      latitude: 23.02,
      longitude: 72.57,
    },
  });
}

async function cleanup() {
  const assignments = await prisma.resourceAssignment.findMany({
    where: { incident: { incidentId: { startsWith: prefix } } },
    select: { assignmentId: true },
  });
  const assignmentIds = assignments.map(({ assignmentId }) => assignmentId);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { entityId: { startsWith: prefix } },
        ...(assignmentIds.length ? [{ entityId: { in: assignmentIds } }] : []),
      ],
    },
  });
  await prisma.resourceAssignment.deleteMany({ where: { incident: { incidentId: { startsWith: prefix } } } });
  await prisma.resource.deleteMany({ where: { resourceId: { startsWith: prefix } } });
  await prisma.incident.deleteMany({ where: { incidentId: { startsWith: prefix } } });
}

test('response orchestration persists atomic lifecycle and history', { skip: !enabled }, async (suite) => {
  const domainEvents = [];
  const realtimeEvents = [];
  const eventBus = { publish: async (event) => domainEvents.push(event) };
  const realtime = { emit: (...args) => realtimeEvents.push(args) };
  const orchestrator = createResponseOrchestrator({ routing, eventBus, realtime });
  const locations = createResourceLocationService({ eventBus, realtime });
  const app = createApp();

  await prisma.$connect();
  await cleanup();

  try {
    await suite.test('creates a routed assignment and advances resource and incident state', async () => {
      await createIncident(`${prefix}INC-LIFECYCLE`);
      await createResource(`${prefix}RES-LIFECYCLE`);

      const result = await orchestrator.assignResource(`${prefix}INC-LIFECYCLE`, {
        resourceId: `${prefix}RES-LIFECYCLE`,
        origin: 'OPTIMIZER',
        role: 'primary suppression',
        reason: 'Best feasible response time',
        optimizationScore: 0.91,
      }, { actorId: 'operator-09', correlationId: 'request-09' });

      const assignment = result.assignment;
      assert.equal(assignment.origin, 'OPTIMIZER');
      assert.equal(assignment.estimatedTravelTimeSeconds, 300);
      assert.equal(assignment.distanceMeters, 1_200);
      assert.equal(assignment.metadata.route.provider, 'integration-fixture');
      assert.equal(new Date(assignment.estimatedArrival).getTime() - new Date(assignment.assignedAt).getTime(), 300_000);

      const resource = await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-LIFECYCLE` } });
      const incident = await prisma.incident.findUnique({ where: { incidentId: `${prefix}INC-LIFECYCLE` } });
      assert.equal(resource.status, 'ASSIGNED');
      assert.equal(resource.currentIncidentId, incident.id);
      assert.equal(incident.status, 'RESOURCE_ASSIGNED');
      assert.ok(domainEvents.some(({ type }) => type === 'ASSIGNMENT_CREATED'));
      assert.ok(realtimeEvents.some(([type]) => type === 'assignment.created'));

      await orchestrator.transitionAssignment(assignment.assignmentId, 'ACCEPTED');
      await orchestrator.transitionAssignment(assignment.assignmentId, 'EN_ROUTE');
      await orchestrator.transitionAssignment(assignment.assignmentId, 'ON_SCENE');
      await assert.rejects(
        orchestrator.transitionAssignment(assignment.assignmentId, 'ACCEPTED'),
        (error) => error.code === 'INVALID_ASSIGNMENT_TRANSITION',
      );
      await orchestrator.transitionAssignment(assignment.assignmentId, 'COMPLETED');

      const completed = await prisma.resourceAssignment.findUnique({ where: { assignmentId: assignment.assignmentId } });
      const released = await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-LIFECYCLE` } });
      const advancedIncident = await prisma.incident.findUnique({ where: { incidentId: `${prefix}INC-LIFECYCLE` } });
      assert.equal(completed.status, 'COMPLETED');
      assert.ok(completed.acceptedAt && completed.departedAt && completed.arrivedAt && completed.completedAt);
      assert.equal(released.status, 'AVAILABLE');
      assert.equal(released.currentIncidentId, null);
      assert.equal(advancedIncident.status, 'ON_SCENE');

      const list = await request(app).get(`/api/v1/incidents/${prefix}INC-LIFECYCLE/assignments`).expect(200);
      assert.equal(list.body.meta.count, 1);
      assert.equal(list.body.data[0].status, 'COMPLETED');
    });

    await suite.test('allows exactly one concurrent claim of a resource', async () => {
      await Promise.all([
        createIncident(`${prefix}INC-RACE-A`),
        createIncident(`${prefix}INC-RACE-B`),
        createResource(`${prefix}RES-RACE`),
      ]);
      const outcomes = await Promise.allSettled([
        orchestrator.assignResource(`${prefix}INC-RACE-A`, { resourceId: `${prefix}RES-RACE` }),
        orchestrator.assignResource(`${prefix}INC-RACE-B`, { resourceId: `${prefix}RES-RACE` }),
      ]);
      assert.equal(outcomes.filter(({ status }) => status === 'fulfilled').length, 1);
      assert.equal(outcomes.filter(({ status }) => status === 'rejected').length, 1);
      assert.equal(outcomes.find(({ status }) => status === 'rejected').reason.code, 'RESOURCE_NOT_AVAILABLE');
      assert.equal(await prisma.resourceAssignment.count({
        where: { resource: { resourceId: `${prefix}RES-RACE` }, status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE'] } },
      }), 1);
    });

    await suite.test('rejects missing incidents and unavailable resources without partial writes', async () => {
      await assert.rejects(
        orchestrator.assignResource(`${prefix}INC-MISSING`, { resourceId: `${prefix}RES-MISSING` }),
        (error) => error.code === 'RESOURCE_NOT_FOUND',
      );
      await Promise.all([
        createIncident(`${prefix}INC-UNAVAILABLE`),
        createResource(`${prefix}RES-UNAVAILABLE`, 'UNAVAILABLE'),
      ]);
      await assert.rejects(
        orchestrator.assignResource(`${prefix}INC-UNAVAILABLE`, { resourceId: `${prefix}RES-UNAVAILABLE` }),
        (error) => error.code === 'RESOURCE_NOT_AVAILABLE',
      );
      assert.equal(await prisma.resourceAssignment.count({
        where: { incident: { incidentId: `${prefix}INC-UNAVAILABLE` } },
      }), 0);
    });

    await suite.test('reassigns without deleting history and cancellation releases the replacement', async () => {
      await Promise.all([
        createIncident(`${prefix}INC-REASSIGN`),
        createResource(`${prefix}RES-OLD`),
        createResource(`${prefix}RES-NEW`),
      ]);
      const initial = await orchestrator.assignResource(`${prefix}INC-REASSIGN`, { resourceId: `${prefix}RES-OLD` });
      const reassigned = await orchestrator.reassignResource(initial.assignment.assignmentId, {
        resourceId: `${prefix}RES-NEW`, reason: 'Original unit became delayed',
      });
      const history = await prisma.resourceAssignment.findMany({
        where: { incident: { incidentId: `${prefix}INC-REASSIGN` } },
      });
      assert.equal(history.length, 2);
      assert.equal(history.find(({ assignmentId }) => assignmentId === initial.assignment.assignmentId).status, 'REASSIGNED');
      assert.equal(history.find(({ assignmentId }) => assignmentId === reassigned.assignment.assignmentId).status, 'ASSIGNED');
      assert.equal(reassigned.assignment.origin, 'ESCALATION');
      assert.equal(reassigned.assignment.metadata.replacesAssignmentId, initial.assignment.assignmentId);
      assert.equal((await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-OLD` } })).status, 'AVAILABLE');

      await orchestrator.cancelAssignment(reassigned.assignment.assignmentId, { reason: 'Stand down replacement' });
      assert.equal((await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-NEW` } })).status, 'AVAILABLE');
      const audits = await prisma.auditLog.findMany({
        where: { entityId: { in: history.map(({ assignmentId }) => assignmentId) } },
      });
      assert.ok(audits.some(({ action }) => action === 'RESOURCE_REASSIGNED'));
      assert.ok(audits.some(({ action }) => action === 'ASSIGNMENT_STATUS_CHANGED'));
    });

    await suite.test('explicit resolution completes assignments and releases resources', async () => {
      await Promise.all([
        createIncident(`${prefix}INC-RESOLVE`),
        createResource(`${prefix}RES-RESOLVE`),
      ]);
      const created = await orchestrator.assignResource(`${prefix}INC-RESOLVE`, { resourceId: `${prefix}RES-RESOLVE` });
      await orchestrator.transitionAssignment(created.assignment.assignmentId, 'EN_ROUTE');
      await orchestrator.transitionAssignment(created.assignment.assignmentId, 'ON_SCENE');
      await prisma.incident.update({ where: { incidentId: `${prefix}INC-RESOLVE` }, data: { status: 'RESOLVING' } });
      const resolved = await orchestrator.resolveIncident(`${prefix}INC-RESOLVE`, { reason: 'Scene secured' });
      assert.equal(resolved.incident.status, 'RESOLVED');
      assert.deepEqual(resolved.releasedResources, [`${prefix}RES-RESOLVE`]);
      assert.equal((await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-RESOLVE` } })).status, 'AVAILABLE');
      assert.equal((await prisma.resourceAssignment.findUnique({
        where: { assignmentId: created.assignment.assignmentId },
      })).status, 'COMPLETED');
    });

    await suite.test('location updates are persisted, audited, and broadcast', async () => {
      await createResource(`${prefix}RES-LOCATION`);
      await locations.update(`${prefix}RES-LOCATION`, { lat: 23.04, lng: 72.59 }, { correlationId: 'location-09' });
      const resource = await prisma.resource.findUnique({ where: { resourceId: `${prefix}RES-LOCATION` } });
      assert.equal(Number(resource.latitude), 23.04);
      assert.equal(Number(resource.longitude), 72.59);
      assert.ok(domainEvents.some(({ type }) => type === 'RESOURCE_LOCATION_UPDATED'));
      assert.ok(realtimeEvents.some(([type]) => type === 'resource.location_updated'));
      assert.equal(await prisma.auditLog.count({
        where: { entityId: `${prefix}RES-LOCATION`, action: 'RESOURCE_LOCATION_UPDATED' },
      }), 1);
    });
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
});
