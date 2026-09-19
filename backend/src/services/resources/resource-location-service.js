import { randomUUID } from 'node:crypto';
import { prisma } from '../../db/prisma.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { NotFoundError } from '../../errors/application-error.js';
import { auditRepository } from '../../repositories/auditRepository.js';
import { resourceRepository } from '../../repositories/resourceRepository.js';

export function createResourceLocationService({
  database = prisma,
  resources = resourceRepository,
  audits = auditRepository,
  eventBus = domainEventBus,
} = {}) {
  return {
    async update(resourceId, location, context = {}) {
      const result = await database.$transaction(async (transaction) => {
        const existing = await transaction.resource.findUnique({ where: { resourceId } });
        if (!existing) throw new NotFoundError('Resource not found');
        const updated = await resources.updateLocation(resourceId, location, transaction);
        await audits.create({
          auditId: `AUD-${randomUUID().toUpperCase()}`,
          actorType: context.actorType ?? 'OPERATOR',
          actorId: context.actorId ?? null,
          action: 'RESOURCE_LOCATION_UPDATED',
          entityType: 'RESOURCE',
          entityId: resourceId,
          previousState: existing.latitude === null ? null : { lat: Number(existing.latitude), lng: Number(existing.longitude) },
          newState: location,
        }, transaction);
        return updated;
      });
      const data = { resourceId, location, status: result.status, updatedAt: result.updatedAt };
      await eventBus.publish({
        type: 'RESOURCE_LOCATION_UPDATED', occurredAt: new Date().toISOString(), resourceId,
        data, correlationId: context.correlationId,
      });
      return result;
    },
  };
}

export const resourceLocationService = createResourceLocationService();
