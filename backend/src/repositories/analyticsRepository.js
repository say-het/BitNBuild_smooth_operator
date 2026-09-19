import { prisma } from '../db/prisma.js';

export function createAnalyticsRepository(database = prisma) {
  return {
    async getOperationalSnapshot() {
      const [incidents, resources, alerts, hospitals] = await database.$transaction([
        database.incident.findMany({
          select: {
            incidentId: true, type: true, severity: true, priority: true, status: true,
            detectedAt: true, resolvedAt: true, createdAt: true,
            assignments: {
              select: {
                assignmentId: true, status: true, assignedAt: true, departedAt: true,
                arrivedAt: true, actualArrival: true, completedAt: true,
              },
            },
          },
        }),
        database.resource.findMany({ select: { resourceId: true, type: true, status: true } }),
        database.alert.findMany({ select: { type: true, status: true, severity: true, createdAt: true } }),
        database.hospital.findMany({
          select: {
            hospitalId: true, name: true, status: true, totalBeds: true, availableBeds: true,
            icuBeds: true, availableIcuBeds: true, emergencyCapacity: true,
            availableEmergencyCapacity: true,
          },
        }),
      ]);
      return { incidents, resources, alerts, hospitals };
    },

    async getHotspots() {
      return database.$queryRaw`
        SELECT
          ST_Y(ST_Centroid(ST_Collect(location::geometry))) AS latitude,
          ST_X(ST_Centroid(ST_Collect(location::geometry))) AS longitude,
          COUNT(*)::int AS "incidentCount",
          SUM(severity)::int AS "severityWeight"
        FROM incidents
        WHERE location IS NOT NULL AND status <> 'CANCELLED'
        GROUP BY ST_SnapToGrid(location::geometry, 0.01)
        ORDER BY "severityWeight" DESC, "incidentCount" DESC
        LIMIT 100
      `;
    },
  };
}

export const analyticsRepository = createAnalyticsRepository();
