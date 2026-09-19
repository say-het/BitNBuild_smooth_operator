import { z } from 'zod';

export const ESCALATION_URGENCIES = Object.freeze(['INFO', 'WARNING', 'HIGH', 'CRITICAL']);
export const ESCALATION_ACTIONS = Object.freeze([
  'ASSIGN_RESOURCE',
  'REASSIGN_RESOURCE',
  'REQUEST_MUTUAL_AID',
  'REVIEW_ROUTE',
  'CONTACT_HOSPITAL',
  'INCREASE_COMMAND_ATTENTION',
]);

const actionSchema = z.object({
  type: z.enum(ESCALATION_ACTIONS),
  resourceId: z.string().trim().min(1).max(128).nullable(),
  details: z.string().trim().min(1).max(300),
}).strict();

export const escalationOutputSchema = z.object({
  escalationRequired: z.boolean(),
  urgency: z.enum(ESCALATION_URGENCIES),
  reason: z.string().trim().min(1).max(500),
  recommendedActions: z.array(actionSchema).max(5),
}).strict();

export const ESCALATION_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['escalationRequired', 'urgency', 'reason', 'recommendedActions'],
  properties: {
    escalationRequired: { type: 'boolean' },
    urgency: { type: 'string', enum: ESCALATION_URGENCIES },
    reason: { type: 'string' },
    recommendedActions: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'resourceId', 'details'],
        properties: {
          type: { type: 'string', enum: ESCALATION_ACTIONS },
          resourceId: { type: ['string', 'null'] },
          details: { type: 'string' },
        },
      },
    },
  },
});
