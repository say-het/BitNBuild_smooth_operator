import { prisma } from '../db/prisma.js';
import { createGeoRepository } from './geoRepository.js';

const ACTIVE_STATUSES = ['CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVING', 'DELAYED', 'ESCALATED', 'REOPTIMIZED'];

export function createIncidentCorrelationRepository(database = prisma) {
  const geo = createGeoRepository(database);
  return {
    findExistingByCandidate(candidateId) {
      return database.incidentCandidate.findUnique({
        where: { id: candidateId },
        include: { correlatedIncident: true, event: true },
      });
    },
    findExistingEventLink(eventId) {
      return database.incidentEvent.findFirst({ where: { eventId }, include: { incident: true } });
    },
    async markCandidateCorrelated(candidateId, incidentId, correlation) {
      await database.incidentCandidate.update({
        where: { id: candidateId },
        data: { correlationStatus: 'CORRELATED', correlatedIncidentId: incidentId, correlationMetadata: correlation, correlatedAt: new Date() },
      });
      return database.incident.findUniqueOrThrow({ where: { id: incidentId } });
    },
    async findNearbyActiveIncidents({ latitude, longitude, timestamp, radiusMeters, timeWindowSeconds }) {
      return geo.findNearbyIncidents({
        latitude,
        longitude,
        timestamp,
        radiusMeters,
        timeWindowSeconds,
        statuses: ACTIVE_STATUSES,
      });
    },
    async createIncident({ incidentId, candidate, event, correlation }) {
      return database.$transaction(async (transaction) => {
        const existingCandidate = await transaction.incidentCandidate.findUnique({ where: { id: candidate.id } });
        if (existingCandidate.correlatedIncidentId) {
          return transaction.incident.findUniqueOrThrow({ where: { id: existingCandidate.correlatedIncidentId } });
        }
        const incident = await transaction.incident.create({
          data: {
            incidentId, type: candidate.incidentType, severity: candidate.severity, priority: candidate.priority,
            status: 'CREATED', confidence: candidate.confidence, title: candidate.title, summary: candidate.summary,
            estimatedVictims: candidate.estimatedVictims, estimatedInjured: candidate.estimatedInjured,
            estimatedTrapped: candidate.estimatedTrapped, hazards: candidate.hazards,
            latitude: candidate.latitude, longitude: candidate.longitude, detectedAt: event.timestamp,
            requiredCapabilities: { create: candidate.requiredCapabilities.map((code) => ({ capability: { connect: { code } } })) },
          },
        });
        if (candidate.latitude !== null && candidate.latitude !== undefined) {
          await transaction.$executeRaw`
            UPDATE incidents SET location = ST_SetSRID(ST_MakePoint(${candidate.longitude}, ${candidate.latitude}), 4326)::geography
            WHERE id = ${incident.id}::uuid
          `;
        }
        await transaction.incidentEvent.create({
          data: { incidentId: incident.id, eventId: event.id, relationshipType: 'PRIMARY_SIGNAL', confidence: candidate.confidence, correlationScore: 1, correlationMetadata: correlation },
        });
        await transaction.incidentCandidate.update({
          where: { id: candidate.id },
          data: { correlationStatus: 'NEW_INCIDENT', correlatedIncidentId: incident.id, correlationMetadata: correlation, correlatedAt: new Date() },
        });
        return incident;
      });
    },
    async updateIncident({ incident, candidate, event, relationshipType, correlation, update }) {
      return database.$transaction(async (transaction) => {
        const existingCandidate = await transaction.incidentCandidate.findUnique({ where: { id: candidate.id } });
        if (existingCandidate.correlatedIncidentId) {
          return transaction.incident.findUniqueOrThrow({ where: { id: existingCandidate.correlatedIncidentId } });
        }
        const updated = await transaction.incident.update({
          where: { id: incident.id },
          data: {
            ...update,
            requiredCapabilities: {
              create: candidate.requiredCapabilities
                .filter((code) => !incident.requiredCapabilities.includes(code))
                .map((code) => ({ capability: { connect: { code } } })),
            },
          },
        });
        await transaction.incidentEvent.upsert({
          where: { incidentId_eventId: { incidentId: incident.id, eventId: event.id } },
          update: {},
          create: { incidentId: incident.id, eventId: event.id, relationshipType, confidence: candidate.confidence, correlationScore: correlation.score, correlationMetadata: correlation },
        });
        await transaction.incidentCandidate.update({
          where: { id: candidate.id },
          data: { correlationStatus: 'CORRELATED', correlatedIncidentId: incident.id, correlationMetadata: correlation, correlatedAt: new Date() },
        });
        return updated;
      });
    },
  };
}

export const incidentCorrelationRepository = createIncidentCorrelationRepository();
