import { prisma } from '../db/prisma.js';

export function createAssignmentRepository(database = prisma) {
  return {
    create(data, client = database) {
      return client.resourceAssignment.create({ data, include: { incident: true, resource: true } });
    },
    findByAssignmentId(assignmentId) {
      return database.resourceAssignment.findUnique({
        where: { assignmentId },
        include: { incident: true, resource: true },
      });
    },
    findIncidentHistory(incidentId) {
      return database.resourceAssignment.findMany({
        where: { incidentId },
        orderBy: { assignedAt: 'asc' },
        include: { resource: true },
      });
    },
    updateStatus(assignmentId, status, timestamps = {}) {
      return database.resourceAssignment.update({
        where: { assignmentId },
        data: { status, ...timestamps },
      });
    },
    async updateStatusWithClient(assignmentId, status, data = {}, client = database, expectedStatus = null) {
      if (expectedStatus) {
        const updated = await client.resourceAssignment.updateMany({
          where: { assignmentId, status: expectedStatus },
          data: { status, ...data },
        });
        if (updated.count !== 1) return null;
        return client.resourceAssignment.findUnique({
          where: { assignmentId },
          include: { incident: true, resource: true },
        });
      }
      return client.resourceAssignment.update({
        where: { assignmentId }, data: { status, ...data }, include: { incident: true, resource: true },
      });
    },
    findIncidentAssignments(incidentId) {
      return database.resourceAssignment.findMany({
        where: { incident: { incidentId } },
        orderBy: { assignedAt: 'asc' },
        include: { resource: true, incident: true },
      });
    },
    findResourceAssignments(resourceId) {
      return database.resourceAssignment.findMany({
        where: { resource: { resourceId } },
        orderBy: { assignedAt: 'desc' },
        include: { resource: true, incident: true },
      });
    },
  };
}

export const assignmentRepository = createAssignmentRepository();
