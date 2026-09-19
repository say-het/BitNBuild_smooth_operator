import { ZodError } from 'zod';
import { logger } from '../../config/logger.js';
import { aiAnalysisRepository } from '../../repositories/aiAnalysisRepository.js';
import { eventRepository } from '../../repositories/eventRepository.js';
import { geminiClient, GeminiClientError } from './gemini-client.js';
import { validateAndNormalizeCandidate } from './incident-intelligence-contract.js';
import { buildIncidentEvidencePrompt } from './incident-intelligence-prompt.js';
import { interpretSensorEvent } from './sensor-incident-interpreter.js';
import { incidentCorrelationService } from '../incidents/incident-correlation-service.js';
import { citizenImageStore } from '../uploads/citizen-image-store.js';

const GEMINI_EVENT_TYPES = new Set(['EMERGENCY_REPORT', 'EMERGENCY_CALL', 'FIELD_UPDATE']);
const TERMINAL_ANALYSIS_STATUSES = new Set(['COMPLETED', 'FAILED', 'SKIPPED']);

function eventLocation(event) {
  if (event.latitude === null || event.latitude === undefined) return event.location ?? null;
  return { lat: Number(event.latitude), lng: Number(event.longitude) };
}

function safeFailure(error) {
  if (error instanceof ZodError) return { errorCode: 'AI_INVALID_OUTPUT', errorMessage: 'AI output failed deterministic validation', attempts: 1 };
  if (error instanceof GeminiClientError) return { errorCode: error.code, errorMessage: 'Incident intelligence provider failed safely', attempts: error.attempts };
  return { errorCode: 'AI_PROCESSING_ERROR', errorMessage: 'Incident intelligence processing failed safely', attempts: 1 };
}

export function createIncidentIntelligenceService({
  analysisRepository = aiAnalysisRepository,
  events = eventRepository,
  client = geminiClient,
  correlationService = null,
  imageStore = citizenImageStore,
} = {}) {
  return {
    async analyzeEvent(event) {
      const deterministic = event.eventType === 'SENSOR_READING';
      const eligibleForGemini = GEMINI_EVENT_TYPES.has(event.eventType);
      const provider = deterministic ? 'DETERMINISTIC' : eligibleForGemini ? client.provider : 'NONE';
      const model = deterministic ? 'sensor-rules-v1' : eligibleForGemini ? client.model : 'not-applicable';
      const analysis = await analysisRepository.createOrGet({
        analysisId: `AI-${event.eventId}`,
        eventId: event.id,
        provider,
        model,
        metadata: { source: event.source, eventType: event.eventType },
      });

      if (TERMINAL_ANALYSIS_STATUSES.has(analysis.status)) {
        return { status: analysis.status, analysis, candidate: analysis.candidate ?? null };
      }
      if (analysis.status === 'PROCESSING') return { status: 'PROCESSING', analysis, candidate: null };

      if (!deterministic && !eligibleForGemini) {
        const skipped = await analysisRepository.skip(analysis.id, `Event type ${event.eventType} does not require incident intelligence`);
        await events.updateProcessingStatus(event.eventId, 'PROCESSED');
        return { status: 'SKIPPED', analysis: skipped, candidate: null };
      }

      await analysisRepository.markProcessing(analysis.id);
      await events.updateProcessingStatus(event.eventId, 'PROCESSING');
      try {
        let raw;
        let attempts = 1;
        if (deterministic) {
          raw = interpretSensorEvent(event);
          if (!raw) {
            const skipped = await analysisRepository.skip(analysis.id, 'Structured sensor reading did not cross an incident threshold');
            await events.updateProcessingStatus(event.eventId, 'PROCESSED');
            return { status: 'SKIPPED', analysis: skipped, candidate: null };
          }
        } else {
          const image = await imageStore.read(event.payload?.image);
          const generated = await client.generateStructured(buildIncidentEvidencePrompt(event), { image });
          raw = generated.output;
          attempts = generated.attempts;
        }
        const candidate = validateAndNormalizeCandidate(raw, eventLocation(event));
        const persisted = await analysisRepository.complete(analysis, candidate, { attempts });
        let correlation = null;
        if (correlationService) {
          try {
            correlation = await correlationService.correlate({ candidate: persisted.candidate, event });
          } catch (correlationError) {
            await events.updateProcessingStatus(event.eventId, 'FAILED', 'CORRELATION_FAILED');
            logger.error({ err: correlationError, eventId: event.eventId, analysisId: analysis.analysisId }, 'incident_correlation.failed');
            return { status: 'COMPLETED', ...persisted, correlationStatus: 'FAILED' };
          }
        }
        await events.updateProcessingStatus(event.eventId, 'PROCESSED');
        logger.info({ eventId: event.eventId, analysisId: analysis.analysisId, provider, model, incidentType: candidate.incidentType, confidence: candidate.confidence }, 'incident_intelligence.completed');
        return { status: 'COMPLETED', ...persisted, correlation };
      } catch (error) {
        const failure = safeFailure(error);
        const failed = await analysisRepository.fail(analysis.id, failure);
        await events.updateProcessingStatus(event.eventId, 'FAILED', failure.errorCode);
        logger.error({ err: error, eventId: event.eventId, analysisId: analysis.analysisId, errorCode: failure.errorCode }, 'incident_intelligence.failed');
        return { status: 'FAILED', analysis: failed, candidate: null, errorCode: failure.errorCode };
      }
    },
  };
}

export const incidentIntelligenceService = createIncidentIntelligenceService({ correlationService: incidentCorrelationService });
