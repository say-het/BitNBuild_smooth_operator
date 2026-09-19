import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { ApplicationError, NotFoundError } from '../../errors/application-error.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { auditRepository } from '../../repositories/auditRepository.js';
import { incidentRepository } from '../../repositories/incidentRepository.js';

export const INCIDENT_TRANSITIONS = Object.freeze({
  CREATED: ['ASSESSING', 'CANCELLED'],
  ASSESSING: ['RESOURCE_RECOMMENDED', 'CANCELLED'],
  RESOURCE_RECOMMENDED: ['RESOURCE_ASSIGNED', 'ASSESSING', 'CANCELLED'],
  RESOURCE_ASSIGNED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ON_SCENE', 'DELAYED', 'CANCELLED'],
  DELAYED: ['ESCALATED', 'EN_ROUTE', 'CANCELLED'],
  ESCALATED: ['REOPTIMIZED', 'CANCELLED'],
  REOPTIMIZED: ['EN_ROUTE', 'CANCELLED'],
  ON_SCENE: ['RESOLVING', 'DELAYED'],
  RESOLVING: ['RESOLVED', 'ON_SCENE'],
  RESOLVED: [],
  CANCELLED: [],
});

export function createIncidentStateService({
  database = prisma, incidents = incidentRepository, audits = auditRepository, eventBus = domainEventBus,
} = {}) {
  const service = {
    canTransition(from, to) {
      return INCIDENT_TRANSITIONS[from]?.includes(to) ?? false;
    },
    async transitionRecord(incident, toStatus, { actorType = 'OPERATOR', actorId = null, reason = null } = {}, client = database) {
      if (!service.canTransition(incident.status, toStatus)) {
        throw new ApplicationError(`Invalid incident transition from ${incident.status} to ${toStatus}`, {
          code: 'INVALID_INCIDENT_TRANSITION', statusCode: 409,
          details: { from: incident.status, to: toStatus, allowed: INCIDENT_TRANSITIONS[incident.status] ?? [] },
        });
      }
      const updated = await incidents.updateState(
        incident.incidentId,
        toStatus,
        toStatus === 'RESOLVED' ? { resolvedAt: new Date() } : {},
        client,
      );
      await audits.create({
        auditId: `AUD-${randomUUID().toUpperCase()}`,
        actorType,
        actorId,
        action: 'INCIDENT_STATE_CHANGED',
        entityType: 'INCIDENT',
        entityId: incident.incidentId,
        previousState: { status: incident.status },
        newState: { status: toStatus },
        metadata: reason ? { reason } : undefined,
      }, client);
      return updated;
    },
    async transition(incidentId, toStatus, context = {}) {
      const incident = await incidents.findByIncidentId(incidentId);
      if (!incident) throw new NotFoundError('Incident not found');
      const updated = await database.$transaction((transaction) => service.transitionRecord(incident, toStatus, context, transaction));
      await eventBus.publish({
        type: 'INCIDENT_STATE_CHANGED', occurredAt: new Date().toISOString(), incidentId,
        data: { incidentId, previousStatus: incident.status, status: updated.status, updatedAt: updated.updatedAt },
        correlationId: context.correlationId,
      });
      return updated;
    },
  };
  return service;
}

export const incidentStateService = createIncidentStateService();
