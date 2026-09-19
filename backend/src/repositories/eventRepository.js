import { prisma } from '../db/prisma.js';
import { runInTransaction } from './runInTransaction.js';

export function createEventRepository(database = prisma) {
  return {
    async create(data) {
      const { location, ...eventData } = data;
      return runInTransaction(database, async (transaction) => {
        const event = await transaction.event.create({
          data: {
            ...eventData,
            latitude: location?.lat,
            longitude: location?.lng,
          },
        });
        if (location) {
          await transaction.$executeRaw`
            UPDATE events
            SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
            WHERE id = ${event.id}::uuid
          `;
        }
        return event;
      });
    },
    findByEventId(eventId) {
      return database.event.findUnique({ where: { eventId } });
    },
    findStatusByEventId(eventId) {
      return database.event.findUnique({
        where: { eventId },
        select: {
          eventId: true, processingStatus: true, processingError: true, updatedAt: true,
          incidents: {
            orderBy: { createdAt: 'asc' }, take: 1,
            select: { incident: { select: { incidentId: true, title: true, status: true } } },
          },
        },
      });
    },
    updateProcessingStatus(eventId, processingStatus, processingError = null) {
      return database.event.update({
        where: { eventId },
        data: { processingStatus, processingError },
      });
    },
    async findMany({ source, eventType, processingStatus, from, to, page, limit }) {
      const where = {
        ...(source ? { source } : {}),
        ...(eventType ? { eventType } : {}),
        ...(processingStatus ? { processingStatus } : {}),
        ...(from || to
          ? {
              timestamp: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
      };
      const [events, total] = await database.$transaction([
        database.event.findMany({
          where,
          orderBy: [{ timestamp: 'desc' }, { eventId: 'asc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        database.event.count({ where }),
      ]);
      return { events, total };
    },
  };
}

export const eventRepository = createEventRepository();
