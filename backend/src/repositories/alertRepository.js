import { prisma } from '../db/prisma.js';

const include = {
  incident: { select: { incidentId: true, priority: true, status: true } },
  resource: { select: { resourceId: true, status: true } },
};

export function createAlertRepository(database = prisma) {
  return {
    create(data, client = database) {
      return client.alert.create({ data, include });
    },
    findActive() {
      return database.alert.findMany({
        where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        include,
      });
    },
    findMany({ status, type, incidentId } = {}) {
      return database.alert.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(type ? { type } : {}),
          ...(incidentId ? { incident: { incidentId } } : {}),
        },
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        include,
      });
    },
    findByAlertId(alertId, client = database) {
      return client.alert.findUnique({ where: { alertId }, include });
    },
    findActiveByDedupKey(dedupKey, client = database) {
      return client.alert.findFirst({
        where: { dedupKey, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
        include,
      });
    },
    findManagedActive() {
      return database.alert.findMany({
        where: { dedupKey: { not: null }, status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } },
        include,
      });
    },
    updateDetection(alertId, data, client = database) {
      return client.alert.update({ where: { alertId }, data, include });
    },
    acknowledge(alertId, acknowledgedAt = new Date(), client = database) {
      return client.alert.update({
        where: { alertId },
        data: { status: 'ACKNOWLEDGED', acknowledgedAt },
        include,
      });
    },
    resolve(alertId, resolvedAt = new Date(), client = database) {
      return client.alert.update({
        where: { alertId },
        data: { status: 'RESOLVED', resolvedAt },
        include,
      });
    },
  };
}

export const alertRepository = createAlertRepository();
