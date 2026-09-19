import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

function assertGeoInput(latitude, longitude, radiusMeters) {
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new RangeError('Invalid latitude or longitude');
  }
  if (radiusMeters <= 0 || radiusMeters > 200_000) {
    throw new RangeError('Radius must be between 1 and 200000 meters');
  }
}

export function createGeoRepository(database = prisma) {
  return {
    findNearbyResources(input, legacyLongitude, legacyRadius = 25_000) {
      const options = typeof input === 'object'
        ? input
        : { latitude: input, longitude: legacyLongitude, radiusMeters: legacyRadius };
      const {
        latitude,
        longitude,
        radiusMeters = 25_000,
        resourceTypes = [],
        capabilities = [],
        status,
        capabilityMatch = 'ALL',
        excludeAssigned = false,
      } = options;
      assertGeoInput(latitude, longitude, radiusMeters);
      const typeFilter = resourceTypes.length
        ? Prisma.sql`AND r.type::text IN (${Prisma.join(resourceTypes)})`
        : Prisma.empty;
      const statusFilter = status
        ? Prisma.sql`AND r.status::text = ${status}`
        : Prisma.empty;
      const capabilityFilter = !capabilities.length
        ? Prisma.empty
        : capabilityMatch === 'ANY'
          ? Prisma.sql`AND EXISTS (
              SELECT 1 FROM resource_capabilities rc
              JOIN capabilities c ON c.id = rc.capability_id
              WHERE rc.resource_id = r.id AND c.code IN (${Prisma.join(capabilities)})
            )`
          : Prisma.sql`AND NOT EXISTS (
            SELECT 1 FROM unnest(ARRAY[${Prisma.join(capabilities)}]::text[]) required(code)
            WHERE NOT EXISTS (
              SELECT 1 FROM resource_capabilities rc
              JOIN capabilities c ON c.id = rc.capability_id
              WHERE rc.resource_id = r.id AND c.code = required.code
            )
          )`;
      const assignmentFilter = excludeAssigned
        ? Prisma.sql`AND NOT EXISTS (
            SELECT 1 FROM resource_assignments ra
            WHERE ra.resource_id = r.id
              AND ra.status IN ('ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE')
          )`
        : Prisma.empty;
      return database.$queryRaw`
        SELECT r.resource_id AS "resourceId", r.name, r.type, r.status,
               r.latitude, r.longitude, r.capacity, r.updated_at AS "updatedAt",
               ST_Distance(r.location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) AS "distanceMeters",
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                   'code', c.code, 'name', c.name, 'proficiency', rc.proficiency
                 ) ORDER BY c.code)
                 FROM resource_capabilities rc
                 JOIN capabilities c ON c.id = rc.capability_id
                 WHERE rc.resource_id = r.id
               ), '[]'::jsonb) AS capabilities
        FROM resources r
        WHERE r.location IS NOT NULL
          AND ST_DWithin(r.location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${radiusMeters})
          ${typeFilter}
          ${statusFilter}
          ${capabilityFilter}
          ${assignmentFilter}
        ORDER BY "distanceMeters" ASC
      `;
    },
    findNearbyHospitals(input, legacyLongitude, legacyRadius = 50_000) {
      const options = typeof input === 'object'
        ? input
        : { latitude: input, longitude: legacyLongitude, radiusMeters: legacyRadius };
      const { latitude, longitude, radiusMeters = 50_000, operationalOnly = false } = options;
      assertGeoInput(latitude, longitude, radiusMeters);
      const statusFilter = operationalOnly ? Prisma.sql`AND status = 'OPERATIONAL'` : Prisma.empty;
      return database.$queryRaw`
        SELECT hospital_id AS "hospitalId", name, status,
               available_beds AS "availableBeds",
               available_icu_beds AS "availableIcuBeds",
               available_emergency_capacity AS "availableEmergencyCapacity",
               latitude, longitude, status_updated_at AS "statusUpdatedAt",
               ST_Distance(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) AS "distanceMeters"
        FROM hospitals
        WHERE location IS NOT NULL
          AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${radiusMeters})
          ${statusFilter}
        ORDER BY "distanceMeters" ASC
      `;
    },
    async findNearbyIncidents({
      latitude,
      longitude,
      radiusMeters = 25_000,
      statuses = [],
      timestamp,
      timeWindowSeconds,
    }) {
      if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
        const incidents = await database.incident.findMany({
          where: {
            ...(statuses.length ? { status: { in: statuses } } : {}),
            ...(timestamp && timeWindowSeconds ? {
              detectedAt: {
                gte: new Date(timestamp.getTime() - timeWindowSeconds * 1_000),
                lte: new Date(timestamp.getTime() + timeWindowSeconds * 1_000),
              },
            } : {}),
          },
          include: {
            requiredCapabilities: { include: { capability: true } },
            events: { orderBy: { event: { timestamp: 'desc' } }, include: { event: true } },
          },
        });
        return incidents.map((incident) => ({
          ...incident,
          distanceMeters: null,
          timeDifferenceSeconds: timestamp
            ? Math.abs(timestamp.getTime() - incident.detectedAt.getTime()) / 1_000
            : null,
          requiredCapabilities: incident.requiredCapabilities.map(({ capability }) => capability.code),
          latestSource: incident.events[0]?.event.source ?? null,
          eventSources: [...new Set(incident.events.map(({ event }) => event.source))],
        }));
      }
      assertGeoInput(latitude, longitude, radiusMeters);
      const statusFilter = statuses.length
        ? Prisma.sql`AND status::text IN (${Prisma.join(statuses)})`
        : Prisma.empty;
      const timeFilter = timestamp && timeWindowSeconds
        ? Prisma.sql`AND detected_at BETWEEN ${new Date(timestamp.getTime() - timeWindowSeconds * 1_000)} AND ${new Date(timestamp.getTime() + timeWindowSeconds * 1_000)}`
        : Prisma.empty;
      return database.$queryRaw`
        SELECT i.id, i.incident_id AS "incidentId", i.type, i.severity, i.priority, i.status,
               i.confidence, i.title, i.summary, i.estimated_victims AS "estimatedVictims",
               i.estimated_injured AS "estimatedInjured", i.estimated_trapped AS "estimatedTrapped",
               i.hazards, i.latitude, i.longitude, i.detected_at AS "detectedAt", i.updated_at AS "updatedAt",
               ST_Distance(i.location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography) AS "distanceMeters",
               ${timestamp ? Prisma.sql`ABS(EXTRACT(EPOCH FROM (${timestamp}::timestamptz - i.detected_at)))` : Prisma.sql`NULL::double precision`} AS "timeDifferenceSeconds",
               COALESCE((SELECT array_agg(c.code ORDER BY c.code) FROM incident_capabilities ic JOIN capabilities c ON c.id = ic.capability_id WHERE ic.incident_id = i.id), ARRAY[]::text[]) AS "requiredCapabilities",
               (SELECT e.source::text FROM incident_events ie JOIN events e ON e.id = ie.event_id WHERE ie.incident_id = i.id ORDER BY e.timestamp DESC LIMIT 1) AS "latestSource",
               COALESCE((SELECT array_agg(DISTINCT e.source::text) FROM incident_events ie JOIN events e ON e.id = ie.event_id WHERE ie.incident_id = i.id), ARRAY[]::text[]) AS "eventSources"
        FROM incidents i
        WHERE i.location IS NOT NULL
          AND ST_DWithin(i.location, ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography, ${radiusMeters})
          ${statusFilter}
          ${timeFilter}
        ORDER BY "distanceMeters" ASC
      `;
    },
  };
}

export const geoRepository = createGeoRepository();
