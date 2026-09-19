import { ZodError } from 'zod';
import { logger } from '../../config/logger.js';
import { geminiClient, GeminiClientError } from './gemini-client.js';
import { operationalAITools } from './operational-ai-tools.js';
import { situationAnalysisSchema, SITUATION_ANALYSIS_RESPONSE_SCHEMA } from './situation-analysis-contract.js';
import { buildSituationAnalysisPrompt, SITUATION_ANALYST_SYSTEM_PROMPT } from './situation-analysis-prompt.js';
import { generateDeterministicSituationAnalysis } from './deterministic-analyst.js';

function unavailable(error, sourceStateTimestamp, model) {
  const errorCode = error instanceof GeminiClientError ? error.code
    : error instanceof ZodError ? 'AI_INVALID_OUTPUT' : 'AI_PROCESSING_ERROR';
  return { available: false, analysis: null, generatedAt: null, model, sourceStateTimestamp, stale: false, errorCode };
}

export function createSituationAnalysisService({ tools = operationalAITools, client = geminiClient, now = () => new Date() } = {}) {
  const cache = new Map();
  return {
    async get(incidentId) {
      const context = await tools.getIncidentSituation(incidentId);
      const cached = cache.get(incidentId);
      if (!cached) {
        return this.analyze(incidentId);
      }
      return { ...cached, stale: new Date(cached.sourceStateTimestamp) < new Date(context.sourceStateTimestamp) };
    },

    async analyze(incidentId, { force = false } = {}) {
      const context = await tools.getIncidentSituation(incidentId);
      const cached = cache.get(incidentId);
      const stale = cached && new Date(cached.sourceStateTimestamp) < new Date(context.sourceStateTimestamp);
      if (cached && !force && !stale) return { ...cached, stale: false };
      logger.info({ incidentId, force, sourceStateTimestamp: context.sourceStateTimestamp }, 'ai.situation_analysis.requested');

      // 1. Try Gemini when configured
      if (client.isConfigured()) {
        try {
          const generated = await client.generateStructured(buildSituationAnalysisPrompt(context), {
            systemPrompt: SITUATION_ANALYST_SYSTEM_PROMPT,
            responseSchema: SITUATION_ANALYSIS_RESPONSE_SCHEMA,
          });
          const analysis = situationAnalysisSchema.parse(generated.output);
          if (analysis.incidentId !== incidentId) {
            throw new GeminiClientError('AI_INVALID_OUTPUT', 'Situation analysis returned the wrong incident ID');
          }
          const result = {
            available: true,
            analysis,
            generatedAt: now().toISOString(),
            model: client.model,
            sourceStateTimestamp: context.sourceStateTimestamp,
            stale: false,
          };
          cache.set(incidentId, result);
          logger.info({ incidentId, model: client.model, attempts: generated.attempts }, 'ai.situation_analysis.completed');
          return result;
        } catch (error) {
          logger.warn({ err: error, incidentId, errorCode: error.code }, 'ai.situation_analysis.gemini_failed_using_fallback');
        }
      }

      // 2. Deterministic rule-based analyst fallback
      try {
        const analysis = generateDeterministicSituationAnalysis(context);
        const result = {
          available: true,
          analysis,
          generatedAt: now().toISOString(),
          model: client.isConfigured() ? `${client.model} (FALLBACK)` : 'DETERMINISTIC_ANALYST',
          sourceStateTimestamp: context.sourceStateTimestamp,
          stale: false,
        };
        cache.set(incidentId, result);
        logger.info({ incidentId, model: result.model }, 'ai.situation_analysis.deterministic_completed');
        return result;
      } catch (fallbackError) {
        logger.error({ err: fallbackError, incidentId }, 'ai.situation_analysis.fallback_failed');
        return unavailable(fallbackError, context.sourceStateTimestamp, client.model);
      }
    },
  };
}

export const situationAnalysisService = createSituationAnalysisService();
