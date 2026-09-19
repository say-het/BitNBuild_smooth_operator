import { z } from 'zod';

export const EVENT_SOURCES = Object.freeze([
  'CITIZEN',
  'EMERGENCY_CALL',
  'SENSOR',
  'FIELD_TEAM',
  'HOSPITAL',
  'GOVERNMENT',
  'WEATHER',
  'SIMULATOR',
  'SYSTEM',
]);

export const EVENT_TYPES = Object.freeze([
  'EMERGENCY_REPORT',
  'EMERGENCY_CALL',
  'SENSOR_READING',
  'FIELD_UPDATE',
  'RESOURCE_UPDATE',
  'HOSPITAL_UPDATE',
  'WEATHER_UPDATE',
  'ROAD_UPDATE',
  'SYSTEM_ALERT',
]);

export const EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const canonicalEventSchema = z.object({
  eventId: z.string().regex(EVENT_ID_PATTERN, 'Invalid eventId format'),
  source: z.enum(EVENT_SOURCES),
  eventType: z.enum(EVENT_TYPES),
  timestamp: z.date(),
  receivedAt: z.date(),
  location: z
    .object({
      lat: z.number().finite().min(-90).max(90),
      lng: z.number().finite().min(-180).max(180),
      accuracyMeters: z.number().finite().nonnegative().max(100_000).optional(),
    })
    .optional(),
  payload: jsonObjectSchema,
  metadata: jsonObjectSchema,
});

export const eventListQuerySchema = z
  .object({
    source: z.enum(EVENT_SOURCES).optional(),
    eventType: z.enum(EVENT_TYPES).optional(),
    processingStatus: z
      .enum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED'])
      .optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .refine((query) => !query.from || !query.to || new Date(query.from) <= new Date(query.to), {
    message: '`from` must not be later than `to`',
    path: ['from'],
  });
