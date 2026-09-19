import { z } from 'zod';
import { ValidationError } from '../../errors/application-error.js';
import { EVENT_SOURCES } from './event-contract.js';

const payloadObjectSchema = z.record(z.string(), z.unknown());
const citizenPayloadSchema = z.object({ text: z.string().trim().min(1) }).loose();
const fieldTeamPayloadSchema = z
  .object({ resourceId: z.string().trim().min(1), status: z.string().trim().min(1) })
  .loose();
const sensorPayloadSchema = payloadObjectSchema.refine(
  (payload) => Object.keys(payload).length > 0,
  'Sensor payload must include at least one reading field',
);

function issues(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function parsePayload(schema, payload, source) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(`Invalid ${source} event payload`, issues(parsed.error));
  }
  return parsed.data;
}

const genericAdapter = {
  adapt(input) {
    return { ...input, payload: parsePayload(payloadObjectSchema, input.payload, input.source) };
  },
};

const adapters = {
  CITIZEN: {
    adapt(input) {
      const schema = input.eventType === 'EMERGENCY_REPORT' ? citizenPayloadSchema : payloadObjectSchema;
      return { ...input, payload: parsePayload(schema, input.payload, input.source) };
    },
  },
  SENSOR: {
    adapt(input) {
      const schema = input.eventType === 'SENSOR_READING' ? sensorPayloadSchema : payloadObjectSchema;
      return { ...input, payload: parsePayload(schema, input.payload, input.source) };
    },
  },
  FIELD_TEAM: {
    adapt(input) {
      const schema = input.eventType === 'FIELD_UPDATE' ? fieldTeamPayloadSchema : payloadObjectSchema;
      return { ...input, payload: parsePayload(schema, input.payload, input.source) };
    },
  },
};

export function getSourceAdapter(source) {
  if (!EVENT_SOURCES.includes(source)) {
    throw new ValidationError('Invalid event source', [{ path: 'source', message: 'Unsupported source' }]);
  }
  return adapters[source] ?? genericAdapter;
}
