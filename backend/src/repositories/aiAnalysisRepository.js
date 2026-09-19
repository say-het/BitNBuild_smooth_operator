import { prisma } from '../db/prisma.js';

export function createAIAnalysisRepository(database = prisma) {
  return {
    async createOrGet({ analysisId, eventId, provider, model, metadata }) {
      const existing = await database.aIAnalysis.findUnique({
        where: { eventId_analysisType: { eventId, analysisType: 'INCIDENT_INTELLIGENCE' } },
        include: { candidate: true },
      });
      if (existing) return existing;
      try {
        return await database.aIAnalysis.create({
          data: { analysisId, eventId, analysisType: 'INCIDENT_INTELLIGENCE', provider, model, metadata },
          include: { candidate: true },
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        return database.aIAnalysis.findUniqueOrThrow({
          where: { eventId_analysisType: { eventId, analysisType: 'INCIDENT_INTELLIGENCE' } },
          include: { candidate: true },
        });
      }
    },
    markProcessing(id) {
      return database.aIAnalysis.update({
        where: { id },
        data: { status: 'PROCESSING', startedAt: new Date(), errorCode: null, errorMessage: null },
      });
    },
    complete(analysis, candidate, { attempts = 1 } = {}) {
      return database.$transaction(async (transaction) => {
        const completed = await transaction.aIAnalysis.update({
          where: { id: analysis.id },
          data: {
            status: 'COMPLETED', result: candidate, confidence: candidate.confidence,
            evidence: candidate.evidence, attempts, completedAt: new Date(), errorCode: null, errorMessage: null,
          },
        });
        const persistedCandidate = await transaction.incidentCandidate.upsert({
          where: { analysisId: analysis.id },
          update: {},
          create: {
            candidateId: `IC-${analysis.analysisId}`,
            eventId: analysis.eventId,
            analysisId: analysis.id,
            incidentType: candidate.incidentType,
            title: candidate.title,
            summary: candidate.summary,
            severity: candidate.severity,
            priority: candidate.priority,
            confidence: candidate.confidence,
            estimatedVictims: candidate.estimatedVictims,
            estimatedInjured: candidate.estimatedInjured,
            estimatedTrapped: candidate.estimatedTrapped,
            hazards: candidate.hazards,
            requiredCapabilities: candidate.requiredCapabilities,
            latitude: candidate.location?.lat,
            longitude: candidate.location?.lng,
            locationConfidence: candidate.locationConfidence,
            evidence: candidate.evidence,
          },
        });
        return { analysis: completed, candidate: persistedCandidate };
      });
    },
    fail(id, { errorCode, errorMessage, attempts = 1 }) {
      return database.aIAnalysis.update({
        where: { id },
        data: { status: 'FAILED', errorCode, errorMessage, attempts, completedAt: new Date() },
      });
    },
    skip(id, reason) {
      return database.aIAnalysis.update({
        where: { id },
        data: { status: 'SKIPPED', errorCode: 'AI_NOT_APPLICABLE', errorMessage: reason, completedAt: new Date() },
      });
    },
    findByEventId(eventId) {
      return database.aIAnalysis.findUnique({
        where: { eventId_analysisType: { eventId, analysisType: 'INCIDENT_INTELLIGENCE' } },
        include: { candidate: true },
      });
    },
  };
}

export const aiAnalysisRepository = createAIAnalysisRepository();
