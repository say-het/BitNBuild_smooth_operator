import { prisma } from '../db/prisma.js';
import { runInTransaction } from './runInTransaction.js';

export function createResourceRepository(database = prisma) {
  return {
    async create(data) {
      const { location, capabilityCodes = [], ...resourceData } = data;
      return runInTransaction(database, async (transaction) => {
        const resource = await transaction.resource.create({
          data: {
            ...resourceData,
            latitude: location?.lat,
            longitude: location?.lng,
            capabilities: {
              create: capabilityCodes.map((code) => ({
                capability: { connect: { code } },
              })),
            },
          },
        });
        if (location) {
          await transaction.$executeRaw`
            UPDATE resources
            SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
            WHERE id = ${resource.id}::uuid
          `;
        }
        return resource;
      });
    },
    findByResourceId(resourceId) {
      return database.resource.findUnique({
        where: { resourceId },
        include: { capabilities: { include: { capability: true } } },
      });
    },
    findAll() {
      return database.resource.findMany({
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        select: {
          resourceId: true,
          name: true,
          type: true,
          status: true,
          latitude: true,
          longitude: true,
          availability: true,
          capacity: true,
          homeBase: true,
          updatedAt: true,
          currentIncident: { select: { incidentId: true } },
          assignments: {
            where: { status: { in: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE'] } },
            orderBy: { assignedAt: 'desc' },
            take: 1,
            select: {
              assignmentId: true, status: true, estimatedArrival: true,
              incident: { select: { incidentId: true } },
            },
          },
          capabilities: {
            select: { proficiency: true, capability: { select: { code: true, name: true } } },
          },
        },
      });
    },
    updateStatus(resourceId, status) {
      return database.resource.update({ where: { resourceId }, data: { status } });
    },
    claimAvailable(resourceId, incidentId, client = database) {
      return client.resource.updateMany({
        where: { resourceId, status: 'AVAILABLE', currentIncidentId: null },
        data: { status: 'ASSIGNED', currentIncidentId: incidentId },
      });
    },
    setOperationalStatus(resourceId, status, currentIncidentId, client = database) {
      return client.resource.update({
        where: { resourceId },
        data: { status, currentIncidentId },
      });
    },
    releaseFromIncident(resourceId, incidentId, client = database) {
      return client.resource.updateMany({
        where: { resourceId, currentIncidentId: incidentId },
        data: { status: 'AVAILABLE', currentIncidentId: null },
      });
    },
    async updateLocation(resourceId, location, client = database) {
      const resource = await client.resource.update({
        where: { resourceId },
        data: { latitude: location.lat, longitude: location.lng },
      });
      await client.$executeRaw`
        UPDATE resources
        SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
        WHERE id = ${resource.id}::uuid
      `;
      return resource;
    },
  };
}

export const resourceRepository = createResourceRepository();
