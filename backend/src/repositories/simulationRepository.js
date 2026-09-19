import { prisma } from '../db/prisma.js';

const publicSelect = {
  id: true,
  runId: true,
  scenarioType: true,
  status: true,
  seed: true,
  timeScale: true,
  simulationTime: true,
  eventsGenerated: true,
  nextEventIndex: true,
  configuration: true,
  worldState: true,
  failure: true,
  startedAt: true,
  endedAt: true,
  createdAt: true,
  updatedAt: true,
};

export function createSimulationRepository(database = prisma) {
  return {
    create(data, groundTruth) {
      return database.simulationRun.create({
        data: {
          ...data,
          groundTruth: {
            create: groundTruth.map((truth) => ({
              groundTruthId: truth.incidentId,
              type: truth.type,
              latitude: truth.location.lat,
              longitude: truth.location.lng,
              startOffsetSeconds: truth.startOffsetSeconds ?? 0,
              severity: truth.severity,
              estimatedVictims: truth.estimatedVictims,
              hazards: truth.hazards,
              requiredCapabilities: truth.requiredCapabilities,
              truth,
            })),
          },
        },
        select: publicSelect,
      });
    },
    findByRunId(runId) {
      return database.simulationRun.findUnique({ where: { runId }, select: publicSelect });
    },
    findMany() {
      return database.simulationRun.findMany({ orderBy: { createdAt: 'desc' }, select: publicSelect });
    },
    update(runId, data) {
      return database.simulationRun.update({ where: { runId }, data, select: publicSelect });
    },
    getGroundTruth(runId) {
      return database.simulationGroundTruthIncident.findMany({
        where: { simulationRun: { runId } },
        orderBy: { groundTruthId: 'asc' },
      });
    },
    getEvaluationOperationalEvents(runId) {
      return database.$queryRaw`
        SELECT
          e.event_id AS "eventId",
          e.event_type::text AS "eventType",
          e.source::text AS source,
          e.processing_status::text AS "processingStatus",
          NULLIF(e.metadata->>'simulationTimeSeconds', '')::int AS "simulationTimeSeconds",
          i.incident_id AS "incidentId",
          i.type::text AS "incidentType",
          i.severity AS "incidentSeverity",
          i.priority::text AS "incidentPriority",
          i.latitude AS "incidentLatitude",
          i.longitude AS "incidentLongitude",
          i.detected_at AS "incidentDetectedAt",
          COALESCE((
            SELECT array_agg(c.code ORDER BY c.code)
            FROM incident_capabilities ic
            JOIN capabilities c ON c.id = ic.capability_id
            WHERE ic.incident_id = i.id
          ), ARRAY[]::text[]) AS "incidentCapabilities"
        FROM events e
        LEFT JOIN incident_events ie ON ie.event_id = e.id
        LEFT JOIN incidents i ON i.id = ie.incident_id
        WHERE e.metadata->>'simulationRunId' = ${runId}
        ORDER BY e.event_id
      `;
    },
    getEvaluationAssignments(runId) {
      return database.$queryRaw`
        WITH simulation_incidents AS (
          SELECT DISTINCT ie.incident_id
          FROM events e
          JOIN incident_events ie ON ie.event_id = e.id
          WHERE e.metadata->>'simulationRunId' = ${runId}
        )
        SELECT
          i.incident_id AS "incidentId", i.detected_at AS "detectedAt",
          ra.assigned_at AS "assignedAt", ra.departed_at AS "departedAt",
          COALESCE(ra.actual_arrival, ra.arrived_at) AS "arrivedAt"
        FROM simulation_incidents si
        JOIN incidents i ON i.id = si.incident_id
        LEFT JOIN resource_assignments ra ON ra.incident_id = i.id
      `;
    },
    async resetOperationalData(runId) {
      return database.$transaction(async (transaction) => {
        const run = await transaction.simulationRun.findUnique({ where: { runId } });
        if (!run) return null;

        const simulationEvents = await transaction.event.findMany({
          where: { metadata: { path: ['simulationRunId'], equals: runId } },
          select: { id: true, processingStatus: true },
        });
        const blockedProcessing = simulationEvents.filter(({ processingStatus }) => !['PROCESSED', 'FAILED', 'IGNORED'].includes(processingStatus)).length;
        if (blockedProcessing) return { run, blockedProcessing };
        const eventIds = simulationEvents.map(({ id }) => id);
        const targetLinks = eventIds.length ? await transaction.incidentEvent.findMany({
          where: { eventId: { in: eventIds } },
          select: { incidentId: true },
        }) : [];
        const candidateIncidentIds = [...new Set(targetLinks.map(({ incidentId }) => incidentId))];
        const allLinks = candidateIncidentIds.length ? await transaction.incidentEvent.findMany({
          where: { incidentId: { in: candidateIncidentIds } },
          select: { incidentId: true, eventId: true },
        }) : [];
        const targetEventIds = new Set(eventIds);
        const ownedIncidentIds = candidateIncidentIds.filter((incidentId) => {
          const links = allLinks.filter((link) => link.incidentId === incidentId);
          return links.length > 0 && links.every((link) => targetEventIds.has(link.eventId));
        });
        const preservedIncidentIds = candidateIncidentIds.filter((id) => !ownedIncidentIds.includes(id));
        if (preservedIncidentIds.length) return { run, blockedMixedIncidents: preservedIncidentIds.length };
        const ownedIncidents = ownedIncidentIds.length ? await transaction.incident.findMany({
          where: { id: { in: ownedIncidentIds } }, select: { incidentId: true },
        }) : [];
        const ownedAssignments = ownedIncidentIds.length ? await transaction.resourceAssignment.findMany({
          where: { incidentId: { in: ownedIncidentIds } },
          select: { assignmentId: true, resource: { select: { resourceId: true } } },
        }) : [];
        const ownedAlerts = ownedIncidentIds.length ? await transaction.alert.findMany({
          where: { incidentId: { in: ownedIncidentIds } }, select: { alertId: true },
        }) : [];

        if (ownedIncidentIds.length) {
          await transaction.alert.deleteMany({ where: { incidentId: { in: ownedIncidentIds } } });
          await transaction.resourceAssignment.deleteMany({ where: { incidentId: { in: ownedIncidentIds } } });
        }
        if (eventIds.length) await transaction.incidentEvent.deleteMany({ where: { eventId: { in: eventIds } } });
        if (ownedIncidentIds.length) await transaction.incident.deleteMany({ where: { id: { in: ownedIncidentIds } } });
        if (eventIds.length) await transaction.event.deleteMany({ where: { id: { in: eventIds } } });

        const resetResourceIds = [...new Set(ownedAssignments.map(({ resource }) => resource.resourceId))];
        const resourceSnapshots = new Map((run.worldState?.resources ?? []).map((item) => [item.resourceId, item]));
        for (const resourceId of resetResourceIds) {
          const snapshot = resourceSnapshots.get(resourceId);
          if (!snapshot) continue;
          await transaction.resource.update({
            where: { resourceId },
            data: { status: snapshot.status, currentIncidentId: null },
          });
        }

        const auditEntityIds = [
          ...ownedIncidents.map(({ incidentId }) => incidentId),
          ...ownedAssignments.map(({ assignmentId }) => assignmentId),
          ...ownedAlerts.map(({ alertId }) => alertId),
        ];
        if (auditEntityIds.length) await transaction.auditLog.deleteMany({ where: { entityId: { in: auditEntityIds } } });

        const resetRun = await transaction.simulationRun.update({
          where: { runId },
          data: {
            status: 'CREATED', simulationTime: 0, eventsGenerated: 0, nextEventIndex: 0,
            failure: null, startedAt: null, endedAt: null,
          },
          select: publicSelect,
        });
        return {
          run: resetRun,
          cleared: {
            events: eventIds.length,
            incidents: ownedIncidentIds.length,
            assignments: ownedAssignments.length,
            alerts: ownedAlerts.length,
            resources: resetResourceIds.length,
          },
          preservedMixedIncidents: 0,
        };
      });
    },
  };
}

export const simulationRepository = createSimulationRepository();
