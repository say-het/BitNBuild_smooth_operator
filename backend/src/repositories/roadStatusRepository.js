import { prisma } from '../db/prisma.js';

export function createRoadStatusRepository(database = prisma) {
  return {
    findLatestUpdates() {
      return database.event.findMany({
        where: { eventType: 'ROAD_UPDATE' },
        orderBy: [{ timestamp: 'desc' }, { createdAt: 'desc' }],
        select: { eventId: true, timestamp: true, payload: true },
        take: 500,
      });
    },
  };
}

export const roadStatusRepository = createRoadStatusRepository();
