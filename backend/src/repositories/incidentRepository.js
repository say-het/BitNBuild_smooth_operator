import { prisma } from '../db/prisma.js';
import { runInTransaction } from './runInTransaction.js';

const activeStatuses = [
  'CREATED',
  'ASSESSING',
  'RESOURCE_RECOMMENDED',
  'RESOURCE_ASSIGNED',
  'EN_ROUTE',
  'ON_SCENE',
  'RESOLVING',
  'DELAYED',
  'ESCALATED',
  'REOPTIMIZED',
];

export function createIncidentRepository(database = prisma) {
  return {
    async create(data) {
      const { location, requiredCapabilityCodes = [], ...incidentData } = data;
      return runInTransaction(database, async (transaction) => {
        const incident = await transaction.incident.create({
          data: {
            ...incidentData,
            latitude: location?.lat,
            longitude: location?.lng,
            requiredCapabilities: {
              create: requiredCapabilityCodes.map((code) => ({
                capability: { connect: { code } },
              })),
            },
          },
        });
        if (location) {
          await transaction.$executeRaw`
            UPDATE incidents
            SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
            WHERE id = ${incident.id}::uuid
          `;
        }
        return incident;
      });
    },
    findByIncidentId(incidentId) {
      return database.incident.findUnique({
        where: { incidentId },
        include: {
          events: { include: { event: true } },
          requiredCapabilities: { include: { capability: true } },
          assignments: true,
        },
      });
    },
    findActive() {
      return database.incident.findMany({
        where: { status: { in: activeStatuses } },
        orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
        select: {
          incidentId: true,
          type: true,
          severity: true,
          priority: true,
          status: true,
          confidence: true,
          title: true,
          summary: true,
          estimatedVictims: true,
          estimatedInjured: true,
          estimatedTrapped: true,
          hazards: true,
          latitude: true,
          longitude: true,
          detectedAt: true,
          updatedAt: true,
          _count: { select: { events: true } },
          requiredCapabilities: { select: { capability: { select: { code: true, name: true } } } },
        },
      });
    },
    findActiveForMonitoring() {
      return database.incident.findMany({
        where: { status: { in: activeStatuses } },
        orderBy: [{ priority: 'asc' }, { updatedAt: 'asc' }],
        include: {
          requiredCapabilities: { include: { capability: true } },
          assignments: {
            where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE'] } },
            include: { resource: { include: { capabilities: { include: { capability: true } } } } },
          },
        },
      });
    },
    linkEvent(incidentId, eventId, relationshipType, confidence = null) {
      return database.incidentEvent.create({
        data: { incidentId, eventId, relationshipType, confidence },
      });
    },
    update(incidentId, data) {
      return database.incident.update({ where: { incidentId }, data });
    },
    findEvents(incidentId) {
      return database.incidentEvent.findMany({
        where: { incident: { incidentId } },
        orderBy: { event: { timestamp: 'asc' } },
        include: { event: true },
      });
    },
    updateState(incidentId, status, data = {}, client = database) {
      return client.incident.update({ where: { incidentId }, data: { status, ...data } });
    },
  };
}

export const incidentRepository = createIncidentRepository();
