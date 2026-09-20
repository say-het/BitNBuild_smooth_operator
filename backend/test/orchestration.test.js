import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  ASSIGNMENT_TRANSITIONS,
  RESOURCE_STATUS_FOR_ASSIGNMENT,
  presentAssignment,
} from '../src/services/orchestration/assignment-contract.js';
import { realtimePublisher } from '../src/sockets/realtime-publisher.js';

test('assignment lifecycle exposes only valid forward transitions', () => {
  assert.deepEqual(ASSIGNMENT_TRANSITIONS.ASSIGNED, ['ACCEPTED', 'EN_ROUTE', 'CANCELLED', 'REASSIGNED']);
  assert.deepEqual(ASSIGNMENT_TRANSITIONS.ACCEPTED, ['EN_ROUTE', 'CANCELLED', 'REASSIGNED']);
  assert.deepEqual(ASSIGNMENT_TRANSITIONS.EN_ROUTE, ['ON_SCENE', 'CANCELLED', 'REASSIGNED']);
  assert.deepEqual(ASSIGNMENT_TRANSITIONS.ON_SCENE, ['COMPLETED', 'CANCELLED', 'REASSIGNED']);
  for (const terminal of ['COMPLETED', 'CANCELLED', 'REASSIGNED']) {
    assert.deepEqual(ASSIGNMENT_TRANSITIONS[terminal], []);
  }
});

test('assignment states map deterministically to resource availability', () => {
  assert.deepEqual(ACTIVE_ASSIGNMENT_STATUSES, ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE']);
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.ASSIGNED, 'ASSIGNED');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.ACCEPTED, 'ASSIGNED');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.EN_ROUTE, 'EN_ROUTE');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.ON_SCENE, 'ON_SCENE');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.COMPLETED, 'AVAILABLE');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.CANCELLED, 'AVAILABLE');
  assert.equal(RESOURCE_STATUS_FOR_ASSIGNMENT.REASSIGNED, 'AVAILABLE');
});

test('assignment presenter keeps route and ETA data while normalizing Decimal-like scores', () => {
  const assignment = presentAssignment({
    assignmentId: 'ASG-1',
    incident: { incidentId: 'INC-1' },
    resource: { resourceId: 'RES-1' },
    status: 'ASSIGNED',
    origin: 'OPTIMIZER',
    role: 'primary',
    estimatedArrival: new Date('2026-09-19T12:05:00.000Z'),
    estimatedTravelTime: 300,
    optimizationScore: { valueOf: () => 0.875 },
    metadata: { route: { provider: 'test', geometry: { type: 'LineString', coordinates: [] } } },
  });
  assert.equal(assignment.incidentId, 'INC-1');
  assert.equal(assignment.resourceId, 'RES-1');
  assert.equal(assignment.estimatedTravelTimeSeconds, 300);
  assert.equal(assignment.optimizationScore, 0.875);
  assert.equal(assignment.metadata.route.provider, 'test');
});

test('realtime publisher emits a versioned envelope', () => {
  const emitted = [];
  realtimePublisher.setServer({ emit: (...args) => emitted.push(args) });
  const envelope = realtimePublisher.emit('assignment.updated', 'ASG-1', { status: 'EN_ROUTE' }, { correlationId: 'REQ-1' });
  realtimePublisher.setServer(undefined);

  assert.equal(emitted.length, 1);
  assert.equal(emitted[0][0], 'assignment.updated');
  assert.deepEqual(emitted[0][1], envelope);
  assert.equal(envelope.aggregateId, 'ASG-1');
  assert.equal(envelope.version, 1);
  assert.equal(envelope.metadata.correlationId, 'REQ-1');
  assert.match(envelope.eventId, /^[0-9a-f-]{36}$/);
});
