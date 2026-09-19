import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { ApplicationError, NotFoundError } from '../../errors/application-error.js';
import { createAssignmentRepository, assignmentRepository } from '../../repositories/assignmentRepository.js';
import { auditRepository } from '../../repositories/auditRepository.js';
import { createIncidentRepository, incidentRepository } from '../../repositories/incidentRepository.js';
import { resourceRepository } from '../../repositories/resourceRepository.js';
import { incidentStateService } from '../incidents/incident-state-service.js';
import { routingService } from '../routing/routing-service.js';
import {
  ACTIVE_ASSIGNMENT_STATUSES,
  ASSIGNMENT_TRANSITIONS,
  RESOURCE_STATUS_FOR_ASSIGNMENT,
  presentAssignment,
} from './assignment-contract.js';

const ASSIGNABLE_INCIDENT_STATUSES = new Set(['RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED']);

function conflict(message, code, details) {
  return new ApplicationError(message, { code, statusCode: 409, details });
}

function auditId() {
  return `AUD-${randomUUID().toUpperCase()}`;
}

function assignmentId() {
  return `ASG-${randomUUID().toUpperCase()}`;
}

function event(type, details) {
  return { type, occurredAt: new Date().toISOString(), ...details };
}

function routeMetadata(route) {
  return {
    routeId: route.routeId,
    provider: route.provider,
    estimated: route.estimated,
    estimateBasis: route.estimateBasis,
    geometry: route.geometry,
    roadStatus: route.roadStatus,
  };
}

function realtimeAssignment(assignment) {
  return {
    assignmentId: assignment.assignmentId,
    incidentId: assignment.incident?.incidentId,
    resourceId: assignment.resource?.resourceId,
    status: assignment.status,
    role: assignment.role,
    assignedAt: assignment.assignedAt,
    estimatedArrival: assignment.estimatedArrival,
    actualArrival: assignment.actualArrival,
    origin: assignment.origin,
    metadata: assignment.metadata,
    updatedAt: assignment.updatedAt,
  };
}

export function createResponseOrchestrator({
  database = prisma,
  assignments = assignmentRepository,
  incidents = incidentRepository,
  resources = resourceRepository,
  audits = auditRepository,
  states = incidentStateService,
  routing = routingService,
  eventBus = domainEventBus,
  now = () => new Date(),
} = {}) {
  async function prepare(incident, request) {
    const resource = await resources.findByResourceId(request.resourceId);
    if (!resource) throw new NotFoundError(`Resource ${request.resourceId} not found`);
    if (incident.latitude === null || incident.latitude === undefined || incident.longitude === null || incident.longitude === undefined) {
      throw conflict('Incident has no routable location', 'INCIDENT_LOCATION_REQUIRED');
    }
    if (resource.latitude === null || resource.latitude === undefined || resource.longitude === null || resource.longitude === undefined) {
      throw conflict('Resource has no routable location', 'RESOURCE_LOCATION_REQUIRED', { resourceId: request.resourceId });
    }
    const route = await routing.getRoute({
      origin: { lat: Number(resource.latitude), lng: Number(resource.longitude) },
      destination: { lat: Number(incident.latitude), lng: Number(incident.longitude) },
      resourceType: resource.type,
    });
    return { request, route };
  }

  async function emitCommitted(created, incident, correlationId) {
    for (const assignment of created) {
      await eventBus.publish(event('ASSIGNMENT_CREATED', {
        assignmentId: assignment.assignmentId,
        incidentId: incident.incidentId,
        resourceId: assignment.resource.resourceId,
        data: realtimeAssignment(assignment),
        correlationId,
      }));
      await eventBus.publish(event('RESOURCE_ASSIGNED', {
        assignmentId: assignment.assignmentId,
        incidentId: incident.incidentId,
        resourceId: assignment.resource.resourceId,
        data: {
          resourceId: assignment.resource.resourceId,
          incidentId: incident.incidentId,
          assignmentId: assignment.assignmentId,
          status: 'ASSIGNED',
        },
        correlationId,
      }));
    }
    await eventBus.publish(event('INCIDENT_UPDATED', {
      incidentId: incident.incidentId,
      data: { incidentId: incident.incidentId, status: incident.status, updatedAt: incident.updatedAt },
      correlationId,
    }));
  }

  const service = {
    async assignResources(incidentIdValue, requests, context = {}) {
      const incident = await incidents.findByIncidentId(incidentIdValue);
      if (!incident) throw new NotFoundError('Incident not found');
      if (!ASSIGNABLE_INCIDENT_STATUSES.has(incident.status)) {
        throw conflict(`Incident cannot receive assignments in ${incident.status} state`, 'INCIDENT_NOT_ASSIGNABLE', { status: incident.status });
      }
      const uniqueIds = new Set(requests.map(({ resourceId }) => resourceId));
      if (uniqueIds.size !== requests.length) {
        throw conflict('A resource may appear only once in a bulk assignment', 'DUPLICATE_RESOURCE_ASSIGNMENT');
      }
      const prepared = await Promise.all(requests.map((request) => prepare(incident, request)));
      const committed = await database.$transaction(async (transaction) => {
        const scopedIncidents = createIncidentRepository(transaction);
        const scopedAssignments = createAssignmentRepository(transaction);
        const currentIncident = await scopedIncidents.findByIncidentId(incidentIdValue);
        if (!currentIncident) throw new NotFoundError('Incident not found');
        if (!ASSIGNABLE_INCIDENT_STATUSES.has(currentIncident.status)) {
          throw conflict(`Incident cannot receive assignments in ${currentIncident.status} state`, 'INCIDENT_NOT_ASSIGNABLE', { status: currentIncident.status });
        }
        const created = [];
        for (const { request, route } of prepared) {
          const claimed = await resources.claimAvailable(request.resourceId, currentIncident.id, transaction);
          if (claimed.count !== 1) {
            throw conflict(`Resource ${request.resourceId} is no longer available`, 'RESOURCE_NOT_AVAILABLE', { resourceId: request.resourceId });
          }
          const assignedAt = now();
          const assignment = await scopedAssignments.create({
            assignmentId: assignmentId(),
            incidentId: currentIncident.id,
            resourceId: (await transaction.resource.findUniqueOrThrow({ where: { resourceId: request.resourceId } })).id,
            status: 'ASSIGNED',
            origin: request.origin ?? 'MANUAL',
            role: request.role ?? null,
            assignedAt,
            estimatedArrival: new Date(assignedAt.getTime() + route.durationSeconds * 1_000),
            assignmentReason: request.reason ?? null,
            distanceMeters: route.distanceMeters,
            estimatedTravelTime: route.durationSeconds,
            optimizationScore: request.optimizationScore,
            metadata: { route: routeMetadata(route) },
          }, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'ASSIGNMENT_CREATED', entityType: 'ASSIGNMENT', entityId: assignment.assignmentId,
            newState: { status: 'ASSIGNED', incidentId: incidentIdValue, resourceId: request.resourceId },
            metadata: { origin: assignment.origin, role: assignment.role, reason: request.reason ?? null },
          }, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'RESOURCE_ASSIGNED', entityType: 'RESOURCE', entityId: request.resourceId,
            previousState: { status: 'AVAILABLE' }, newState: { status: 'ASSIGNED', incidentId: incidentIdValue },
          }, transaction);
          created.push(assignment);
        }
        let updatedIncident = currentIncident;
        if (currentIncident.status === 'RESOURCE_RECOMMENDED') {
          updatedIncident = await states.transitionRecord(currentIncident, 'RESOURCE_ASSIGNED', {
            actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            reason: context.reason ?? 'Resource assignment created',
          }, transaction);
        }
        return { assignments: created, incident: updatedIncident };
      });
      await emitCommitted(committed.assignments, committed.incident, context.correlationId);
      logger.info({ incidentId: incidentIdValue, assignmentCount: committed.assignments.length }, 'response.assignments.created');
      return {
        assignments: committed.assignments.map(presentAssignment),
        incident: committed.incident,
        resources: committed.assignments.map(({ resource }) => ({
          resourceId: resource.resourceId,
          status: resource.status,
          incidentId: incidentIdValue,
        })),
      };
    },

    async assignResource(incidentIdValue, request, context = {}) {
      const result = await service.assignResources(incidentIdValue, [request], context);
      return {
        assignment: result.assignments[0],
        incident: result.incident,
        resource: result.resources[0],
      };
    },

    async transitionAssignment(assignmentIdValue, toStatus, context = {}) {
      const committed = await database.$transaction(async (transaction) => {
        const scopedAssignments = createAssignmentRepository(transaction);
        const assignment = await scopedAssignments.findByAssignmentId(assignmentIdValue);
        if (!assignment) throw new NotFoundError('Assignment not found');
        if (!(ASSIGNMENT_TRANSITIONS[assignment.status] ?? []).includes(toStatus)) {
          throw conflict(`Invalid assignment transition from ${assignment.status} to ${toStatus}`, 'INVALID_ASSIGNMENT_TRANSITION', {
            from: assignment.status, to: toStatus, allowed: ASSIGNMENT_TRANSITIONS[assignment.status] ?? [],
          });
        }
        const timestamp = now();
        const timestamps = {
          ...(toStatus === 'ACCEPTED' ? { acceptedAt: timestamp } : {}),
          ...(toStatus === 'EN_ROUTE' ? { departedAt: timestamp } : {}),
          ...(toStatus === 'ON_SCENE' ? { arrivedAt: timestamp, actualArrival: timestamp } : {}),
          ...(['COMPLETED', 'CANCELLED', 'REASSIGNED'].includes(toStatus) ? { completedAt: timestamp } : {}),
        };
        const updated = await scopedAssignments.updateStatusWithClient(
          assignmentIdValue, toStatus, timestamps, transaction, assignment.status,
        );
        if (!updated) {
          throw conflict('Assignment changed while the transition was being applied', 'ASSIGNMENT_STATE_CONFLICT');
        }
        const resourceStatus = RESOURCE_STATUS_FOR_ASSIGNMENT[toStatus];
        const released = !ACTIVE_ASSIGNMENT_STATUSES.includes(toStatus);
        if (released) {
          await resources.releaseFromIncident(assignment.resource.resourceId, assignment.incidentId, transaction);
        } else {
          await resources.setOperationalStatus(assignment.resource.resourceId, resourceStatus, assignment.incidentId, transaction);
        }
        let incident = assignment.incident;
        if (toStatus === 'EN_ROUTE' && ['RESOURCE_ASSIGNED', 'REOPTIMIZED', 'DELAYED'].includes(incident.status)) {
          incident = await states.transitionRecord(incident, 'EN_ROUTE', context, transaction);
        }
        if (toStatus === 'ON_SCENE' && incident.status === 'EN_ROUTE') {
          incident = await states.transitionRecord(incident, 'ON_SCENE', context, transaction);
        }
        await audits.create({
          auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
          action: 'ASSIGNMENT_STATUS_CHANGED', entityType: 'ASSIGNMENT', entityId: assignmentIdValue,
          previousState: { status: assignment.status }, newState: { status: toStatus },
          metadata: context.reason ? { reason: context.reason } : undefined,
        }, transaction);
        await audits.create({
          auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
          action: released ? 'RESOURCE_RELEASED' : 'RESOURCE_STATUS_CHANGED', entityType: 'RESOURCE', entityId: assignment.resource.resourceId,
          previousState: { status: assignment.resource.status }, newState: { status: resourceStatus },
        }, transaction);
        return { assignment: updated, incident, previousIncidentStatus: assignment.incident.status, released, resourceStatus };
      });
      const common = {
        assignmentId: assignmentIdValue,
        incidentId: committed.incident.incidentId,
        resourceId: committed.assignment.resource.resourceId,
        correlationId: context.correlationId,
      };
      await eventBus.publish(event('ASSIGNMENT_STATUS_CHANGED', { ...common, data: realtimeAssignment(committed.assignment) }));
      await eventBus.publish(event(committed.released ? 'RESOURCE_RELEASED' : 'RESOURCE_UPDATED', {
        ...common,
        data: {
          resourceId: committed.assignment.resource.resourceId,
          status: committed.resourceStatus,
          incidentId: committed.incident.incidentId,
          currentIncidentId: committed.released ? null : committed.incident.incidentId,
          assignmentId: assignmentIdValue,
        },
      }));
      if (committed.previousIncidentStatus !== committed.incident.status) {
        await eventBus.publish(event('INCIDENT_STATE_CHANGED', {
          incidentId: committed.incident.incidentId,
          data: {
            incidentId: committed.incident.incidentId,
            previousStatus: committed.previousIncidentStatus,
            status: committed.incident.status,
            updatedAt: committed.incident.updatedAt,
          },
          correlationId: context.correlationId,
        }));
      }
      return {
        assignment: presentAssignment(committed.assignment),
        incident: committed.incident,
        resource: {
          resourceId: committed.assignment.resource.resourceId,
          status: committed.resourceStatus,
          incidentId: committed.released ? null : committed.incident.incidentId,
        },
      };
    },

    cancelAssignment(assignmentIdValue, context = {}) {
      return service.transitionAssignment(assignmentIdValue, 'CANCELLED', context);
    },

    async reassignResource(assignmentIdValue, replacement, context = {}) {
      const existing = await assignments.findByAssignmentId(assignmentIdValue);
      if (!existing) throw new NotFoundError('Assignment not found');
      if (!(ASSIGNMENT_TRANSITIONS[existing.status] ?? []).includes('REASSIGNED')) {
        throw conflict(`Assignment cannot be reassigned from ${existing.status}`, 'INVALID_ASSIGNMENT_TRANSITION');
      }
      const prepared = await prepare(existing.incident, replacement);
      const committed = await database.$transaction(async (transaction) => {
        const scopedAssignments = createAssignmentRepository(transaction);
        const current = await scopedAssignments.findByAssignmentId(assignmentIdValue);
        if (!current || !(ASSIGNMENT_TRANSITIONS[current.status] ?? []).includes('REASSIGNED')) {
          throw conflict('Assignment is no longer reassignable', 'INVALID_ASSIGNMENT_TRANSITION');
        }
        const reassigned = await scopedAssignments.updateStatusWithClient(
          assignmentIdValue, 'REASSIGNED', { completedAt: now() }, transaction, current.status,
        );
        if (!reassigned) {
          throw conflict('Assignment changed while reassignment was being applied', 'ASSIGNMENT_STATE_CONFLICT');
        }
        await resources.releaseFromIncident(current.resource.resourceId, current.incidentId, transaction);
        const claimed = await resources.claimAvailable(replacement.resourceId, current.incidentId, transaction);
        if (claimed.count !== 1) throw conflict(`Resource ${replacement.resourceId} is no longer available`, 'RESOURCE_NOT_AVAILABLE');
        const replacementResource = await transaction.resource.findUniqueOrThrow({ where: { resourceId: replacement.resourceId } });
        const assignedAt = now();
        const created = await scopedAssignments.create({
          assignmentId: assignmentId(), incidentId: current.incidentId, resourceId: replacementResource.id,
          status: 'ASSIGNED', origin: replacement.origin ?? 'ESCALATION', role: replacement.role ?? current.role,
          assignedAt, estimatedArrival: new Date(assignedAt.getTime() + prepared.route.durationSeconds * 1_000),
          assignmentReason: replacement.reason ?? 'Resource reassignment', distanceMeters: prepared.route.distanceMeters,
          estimatedTravelTime: prepared.route.durationSeconds, optimizationScore: replacement.optimizationScore,
          metadata: { route: routeMetadata(prepared.route), replacesAssignmentId: assignmentIdValue },
        }, transaction);
        const auditBase = {
          actorType: context.actorType ?? 'OPERATOR',
          actorId: context.actorId ?? null,
        };
        await audits.create({
          auditId: auditId(), ...auditBase,
          action: 'ASSIGNMENT_STATUS_CHANGED', entityType: 'ASSIGNMENT', entityId: assignmentIdValue,
          previousState: { status: current.status }, newState: { status: 'REASSIGNED' },
          metadata: { replacementAssignmentId: created.assignmentId, reason: replacement.reason ?? null },
        }, transaction);
        await audits.create({
          auditId: auditId(), ...auditBase,
          action: 'RESOURCE_RELEASED', entityType: 'RESOURCE', entityId: current.resource.resourceId,
          previousState: { status: current.resource.status }, newState: { status: 'AVAILABLE' },
        }, transaction);
        await audits.create({
          auditId: auditId(), ...auditBase,
          action: 'ASSIGNMENT_CREATED', entityType: 'ASSIGNMENT', entityId: created.assignmentId,
          newState: { status: 'ASSIGNED', incidentId: current.incident.incidentId, resourceId: replacement.resourceId },
          metadata: { origin: created.origin, role: created.role, replacesAssignmentId: assignmentIdValue },
        }, transaction);
        await audits.create({
          auditId: auditId(), ...auditBase,
          action: 'RESOURCE_ASSIGNED', entityType: 'RESOURCE', entityId: replacement.resourceId,
          previousState: { status: 'AVAILABLE' },
          newState: { status: 'ASSIGNED', incidentId: current.incident.incidentId },
        }, transaction);
        await audits.create({
          auditId: auditId(), ...auditBase,
          action: 'RESOURCE_REASSIGNED', entityType: 'ASSIGNMENT', entityId: created.assignmentId,
          previousState: { assignmentId: assignmentIdValue, resourceId: current.resource.resourceId },
          newState: { assignmentId: created.assignmentId, resourceId: replacement.resourceId },
          metadata: { reason: replacement.reason ?? null },
        }, transaction);
        return { previous: current, assignment: created };
      });
      await eventBus.publish(event('RESOURCE_REASSIGNED', {
        previousAssignmentId: assignmentIdValue,
        assignmentId: committed.assignment.assignmentId,
        resourceId: replacement.resourceId,
      }));
      await eventBus.publish(event('ASSIGNMENT_STATUS_CHANGED', {
        assignmentId: assignmentIdValue,
        incidentId: committed.previous.incident.incidentId,
        resourceId: committed.previous.resource.resourceId,
        data: {
          assignmentId: assignmentIdValue, status: 'REASSIGNED',
          incidentId: committed.previous.incident.incidentId, resourceId: committed.previous.resource.resourceId,
        },
        correlationId: context.correlationId,
      }));
      await eventBus.publish(event('RESOURCE_RELEASED', {
        resourceId: committed.previous.resource.resourceId,
        assignmentId: assignmentIdValue,
        incidentId: committed.previous.incident.incidentId,
        data: {
          resourceId: committed.previous.resource.resourceId, status: 'AVAILABLE', assignmentId: assignmentIdValue,
          incidentId: committed.previous.incident.incidentId, currentIncidentId: null,
        },
        correlationId: context.correlationId,
      }));
      await eventBus.publish(event('ASSIGNMENT_CREATED', {
        assignmentId: committed.assignment.assignmentId,
        incidentId: committed.assignment.incident.incidentId,
        resourceId: replacement.resourceId,
        data: realtimeAssignment(committed.assignment),
        correlationId: context.correlationId,
      }));
      await eventBus.publish(event('RESOURCE_ASSIGNED', {
        assignmentId: committed.assignment.assignmentId,
        incidentId: committed.assignment.incident.incidentId,
        resourceId: replacement.resourceId,
        data: {
          resourceId: replacement.resourceId,
          incidentId: committed.assignment.incident.incidentId,
          assignmentId: committed.assignment.assignmentId,
          status: 'ASSIGNED',
        },
        correlationId: context.correlationId,
      }));
      return {
        previousAssignmentId: assignmentIdValue,
        assignment: presentAssignment(committed.assignment),
        resource: { resourceId: replacement.resourceId, status: 'ASSIGNED', incidentId: committed.assignment.incident.incidentId },
      };
    },

    async cancelIncident(incidentIdValue, context = {}) {
      const committed = await database.$transaction(async (transaction) => {
        const scopedIncidents = createIncidentRepository(transaction);
        const current = await scopedIncidents.findByIncidentId(incidentIdValue);
        if (!current) throw new NotFoundError('Incident not found');
        if (!states.canTransition(current.status, 'CANCELLED')) {
          throw conflict(`Incident cannot be cancelled from ${current.status}`, 'INVALID_INCIDENT_TRANSITION', { status: current.status });
        }
        const activeAssignments = await transaction.resourceAssignment.findMany({
          where: { incidentId: current.id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          include: { resource: true, incident: true },
        });
        for (const assignment of activeAssignments) {
          const cancelled = await transaction.resourceAssignment.updateMany({
            where: { id: assignment.id, status: assignment.status }, data: { status: 'CANCELLED', completedAt: now() },
          });
          if (cancelled.count !== 1) throw conflict('Assignment changed while incident cancellation was being applied', 'ASSIGNMENT_STATE_CONFLICT');
          await resources.releaseFromIncident(assignment.resource.resourceId, current.id, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'ASSIGNMENT_CANCELLED_ON_INCIDENT_CANCELLATION', entityType: 'ASSIGNMENT', entityId: assignment.assignmentId,
            previousState: { status: assignment.status }, newState: { status: 'CANCELLED' },
          }, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'RESOURCE_RELEASED', entityType: 'RESOURCE', entityId: assignment.resource.resourceId,
            previousState: { status: assignment.resource.status }, newState: { status: 'AVAILABLE' },
          }, transaction);
        }
        const incident = await states.transitionRecord(current, 'CANCELLED', context, transaction);
        return { incident, assignments: activeAssignments, previousStatus: current.status };
      });
      for (const assignment of committed.assignments) {
        await eventBus.publish(event('ASSIGNMENT_STATUS_CHANGED', {
          assignmentId: assignment.assignmentId, incidentId: incidentIdValue, resourceId: assignment.resource.resourceId,
          data: { assignmentId: assignment.assignmentId, incidentId: incidentIdValue, resourceId: assignment.resource.resourceId, status: 'CANCELLED' },
          correlationId: context.correlationId,
        }));
        await eventBus.publish(event('RESOURCE_RELEASED', {
          resourceId: assignment.resource.resourceId, assignmentId: assignment.assignmentId, incidentId: incidentIdValue,
          data: { resourceId: assignment.resource.resourceId, status: 'AVAILABLE', assignmentId: assignment.assignmentId, incidentId: incidentIdValue, currentIncidentId: null },
          correlationId: context.correlationId,
        }));
      }
      await eventBus.publish(event('INCIDENT_STATE_CHANGED', {
        incidentId: incidentIdValue,
        data: { incidentId: incidentIdValue, previousStatus: committed.previousStatus, status: 'CANCELLED', updatedAt: committed.incident.updatedAt },
        correlationId: context.correlationId,
      }));
      return {
        incident: committed.incident,
        releasedResources: committed.assignments.map(({ resource }) => resource.resourceId),
        cancelledAssignments: committed.assignments.map(({ assignmentId: id }) => id),
      };
    },

    async resolveIncident(incidentIdValue, context = {}) {
      const committed = await database.$transaction(async (transaction) => {
        const scopedIncidents = createIncidentRepository(transaction);
        const current = await scopedIncidents.findByIncidentId(incidentIdValue);
        if (!current) throw new NotFoundError('Incident not found');
        if (current.status !== 'RESOLVING') {
          throw conflict(`Incident cannot resolve from ${current.status}`, 'INVALID_INCIDENT_TRANSITION', { status: current.status });
        }
        const activeAssignments = await transaction.resourceAssignment.findMany({
          where: { incidentId: current.id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } },
          include: { resource: true, incident: true },
        });
        for (const assignment of activeAssignments) {
          const completed = await transaction.resourceAssignment.updateMany({
            where: { id: assignment.id, status: assignment.status },
            data: { status: 'COMPLETED', completedAt: now() },
          });
          if (completed.count !== 1) {
            throw conflict('Assignment changed while incident resolution was being applied', 'ASSIGNMENT_STATE_CONFLICT');
          }
          await resources.releaseFromIncident(assignment.resource.resourceId, current.id, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'ASSIGNMENT_COMPLETED_ON_RESOLUTION', entityType: 'ASSIGNMENT', entityId: assignment.assignmentId,
            previousState: { status: assignment.status }, newState: { status: 'COMPLETED' },
          }, transaction);
          await audits.create({
            auditId: auditId(), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
            action: 'RESOURCE_RELEASED', entityType: 'RESOURCE', entityId: assignment.resource.resourceId,
            previousState: { status: assignment.resource.status }, newState: { status: 'AVAILABLE' },
          }, transaction);
        }
        const resolved = await states.transitionRecord(current, 'RESOLVED', context, transaction);
        return { incident: resolved, assignments: activeAssignments };
      });
      for (const assignment of committed.assignments) {
        await eventBus.publish(event('ASSIGNMENT_STATUS_CHANGED', {
          assignmentId: assignment.assignmentId,
          incidentId: incidentIdValue,
          resourceId: assignment.resource.resourceId,
          data: { assignmentId: assignment.assignmentId, incidentId: incidentIdValue, resourceId: assignment.resource.resourceId, status: 'COMPLETED' },
          correlationId: context.correlationId,
        }));
        await eventBus.publish(event('RESOURCE_RELEASED', {
          resourceId: assignment.resource.resourceId,
          assignmentId: assignment.assignmentId,
          incidentId: incidentIdValue,
          data: {
            resourceId: assignment.resource.resourceId, status: 'AVAILABLE', assignmentId: assignment.assignmentId,
            incidentId: incidentIdValue, currentIncidentId: null,
          },
          correlationId: context.correlationId,
        }));
      }
      await eventBus.publish(event('INCIDENT_RESOLVED', {
        incidentId: incidentIdValue,
        data: { incidentId: incidentIdValue, status: 'RESOLVED', updatedAt: committed.incident.updatedAt },
        correlationId: context.correlationId,
      }));
      return {
        incident: committed.incident,
        releasedResources: committed.assignments.map(({ resource }) => resource.resourceId),
        completedAssignments: committed.assignments.map(({ assignmentId: id }) => id),
      };
    },
  };
  return service;
}

export const responseOrchestrator = createResponseOrchestrator();
