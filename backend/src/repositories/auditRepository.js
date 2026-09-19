import { prisma } from '../db/prisma.js';

export function createAuditRepository(database = prisma) {
  return {
    create(data, client = database) {
      return client.auditLog.create({ data });
    },
    findForEntity(entityType, entityId) {
      return database.auditLog.findMany({
        where: { entityType, entityId },
        orderBy: { createdAt: 'asc' },
      });
    },
  };
}

export const auditRepository = createAuditRepository();
