import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { greedyOptimize } from './greedy-optimizer.js';

const VALID_STATUSES = new Set(['OPTIMAL', 'FEASIBLE', 'PARTIAL', 'INFEASIBLE', 'FAILED']);

function validResult(result) {
  return result && VALID_STATUSES.has(result.status)
    && Array.isArray(result.assignments)
    && Array.isArray(result.unfulfilledRequirements)
    && Number.isFinite(result.objectiveValue);
}

export function createOptimizationService({
  url = env.OPTIMIZER_URL,
  timeoutMs = env.OPTIMIZER_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  fallback = greedyOptimize,
} = {}) {
  return {
    async optimize(payload) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl(`${url.replace(/\/$/, '')}/optimize`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Optimizer returned HTTP ${response.status}`);
        const result = await response.json();
        if (!validResult(result)) throw new Error('Optimizer returned an invalid result');
        logger.info({ optimizer: 'OR_TOOLS', status: result.status, assignments: result.assignments.length }, 'optimization.completed');
        return { ...result, optimizer: 'OR_TOOLS' };
      } catch (error) {
        logger.warn({ err: error }, 'optimization.fallback');
        return fallback(payload);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

export const optimizationService = createOptimizationService();
