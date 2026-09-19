import { z } from 'zod';

export const SITUATION_ACTION_TYPES = Object.freeze([
  'REVIEW_RESOURCE_GAP', 'REVIEW_RESPONSE_DELAY', 'REVIEW_HOSPITAL_CAPACITY',
  'REVIEW_ESCALATION', 'MONITOR_INCIDENT',
]);

export const situationAnalysisSchema = z.object({
  incidentId: z.string().trim().min(1).max(128),
  summary: z.string().trim().min(1).max(1_000),
  currentResponse: z.string().trim().min(1).max(1_000).nullable(),
  keyRisks: z.array(z.string().trim().min(1).max(240)).max(10),
  resourceGaps: z.array(z.string().trim().min(1).max(80)).max(10),
  hospitalConsiderations: z.array(z.string().trim().min(1).max(240)).max(10),
  recommendedActions: z.array(z.object({
    type: z.enum(SITUATION_ACTION_TYPES),
    description: z.string().trim().min(1).max(300),
  }).strict()).max(8),
  confidence: z.number().finite().min(0).max(1),
}).strict();

export const SITUATION_ANALYSIS_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['incidentId', 'summary', 'currentResponse', 'keyRisks', 'resourceGaps', 'hospitalConsiderations', 'recommendedActions', 'confidence'],
  properties: {
    incidentId: { type: 'string' },
    summary: { type: 'string' },
    currentResponse: { type: ['string', 'null'] },
    keyRisks: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    resourceGaps: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    hospitalConsiderations: { type: 'array', items: { type: 'string' }, maxItems: 10 },
    recommendedActions: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['type', 'description'],
        properties: { type: { type: 'string', enum: SITUATION_ACTION_TYPES }, description: { type: 'string' } },
      },
    },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
});
