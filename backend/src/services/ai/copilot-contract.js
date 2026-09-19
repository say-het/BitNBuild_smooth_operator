import { z } from 'zod';

export const MAP_ACTION_TYPES = Object.freeze([
  'FOCUS_INCIDENT', 'FOCUS_RESOURCE', 'FOCUS_HOSPITAL',
  'SHOW_INCIDENTS', 'SHOW_RESOURCES', 'SHOW_ROUTE',
]);

const referenceSchema = z.object({
  entityType: z.enum(['INCIDENT', 'RESOURCE', 'HOSPITAL', 'ALERT', 'ASSIGNMENT']),
  entityId: z.string().trim().min(1).max(128),
}).strict();

const mapActionSchema = z.object({
  type: z.enum(MAP_ACTION_TYPES),
  entityId: z.string().trim().min(1).max(128).optional(),
  entityIds: z.array(z.string().trim().min(1).max(128)).max(25).optional(),
}).strict().superRefine((action, context) => {
  const multiple = ['SHOW_INCIDENTS', 'SHOW_RESOURCES'].includes(action.type);
  if (multiple && !action.entityIds?.length) context.addIssue({ code: 'custom', message: 'entityIds are required' });
  if (!multiple && !action.entityId) context.addIssue({ code: 'custom', message: 'entityId is required' });
});

export const copilotResponseSchema = z.object({
  answer: z.string().trim().min(1).max(2_000),
  references: z.array(referenceSchema).max(20),
  mapActions: z.array(mapActionSchema).max(10),
  suggestedFollowUps: z.array(z.string().trim().min(1).max(180)).max(4),
}).strict();

export const COPILOT_RESPONSE_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['answer', 'references', 'mapActions', 'suggestedFollowUps'],
  properties: {
    answer: { type: 'string' },
    references: {
      type: 'array', maxItems: 20,
      items: {
        type: 'object', additionalProperties: false, required: ['entityType', 'entityId'],
        properties: {
          entityType: { type: 'string', enum: ['INCIDENT', 'RESOURCE', 'HOSPITAL', 'ALERT', 'ASSIGNMENT'] },
          entityId: { type: 'string' },
        },
      },
    },
    mapActions: {
      type: 'array', maxItems: 10,
      items: {
        type: 'object', additionalProperties: false, required: ['type'],
        properties: {
          type: { type: 'string', enum: MAP_ACTION_TYPES },
          entityId: { type: 'string' },
          entityIds: { type: 'array', items: { type: 'string' }, maxItems: 25 },
        },
      },
    },
    suggestedFollowUps: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
});
