import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../errors/application-error.js';
import { canonicalEventSchema, EVENT_TYPES } from './event-contract.js';
import { getSourceAdapter } from './source-adapters.js';

const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function validationDetails(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function normalizeTimestamp(value, receivedAt, metadata) {
  if (value === undefined || value === null || value === '') {
    metadata.timestampFallback = 'receivedAt';
    return receivedAt;
  }
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    throw new ValidationError('Invalid event timestamp', [
      { path: 'timestamp', message: 'Expected a valid ISO-8601 timestamp' },
    ]);
  }
  if (timestamp.getTime() > receivedAt.getTime() + FUTURE_TOLERANCE_MS) {
    throw new ValidationError('Invalid event timestamp', [
      { path: 'timestamp', message: 'Timestamp is more than five minutes in the future' },
    ]);
  }
  return timestamp;
}

function normalizeLocation(input) {
  const candidate = input.location ?? input.geometry;
  let lat;
  let lng;
  let accuracyMeters;

  if (candidate?.type === 'Point' && Array.isArray(candidate.coordinates)) {
    [lng, lat] = candidate.coordinates;
    accuracyMeters = candidate.accuracyMeters;
  } else if (candidate !== undefined) {
    lat = candidate?.lat ?? candidate?.latitude;
    lng = candidate?.lng ?? candidate?.longitude;
    accuracyMeters = candidate?.accuracyMeters;
  } else {
    lat = input.latitude;
    lng = input.longitude;
    accuracyMeters = input.accuracyMeters;
  }

  const locationWasProvided =
    candidate !== undefined ||
    input.latitude !== undefined ||
    input.longitude !== undefined ||
    input.accuracyMeters !== undefined;

  if (!locationWasProvided) return undefined;
  if (lat === undefined || lng === undefined) {
    throw new ValidationError('Invalid event location', [
      { path: 'location', message: 'Both latitude and longitude are required' },
    ]);
  }

  return { lat, lng, ...(accuracyMeters === undefined ? {} : { accuracyMeters }) };
}

export function normalizeEvent(input, { now = () => new Date() } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('Invalid event input', [
      { path: '', message: 'Request body must be an object' },
    ]);
  }
  if (typeof input.source !== 'string') {
    throw new ValidationError('Invalid event source', [
      { path: 'source', message: 'Source is required' },
    ]);
  }
  if (typeof input.eventType !== 'string' || !EVENT_TYPES.includes(input.eventType)) {
    throw new ValidationError('Invalid event type', [
      { path: 'eventType', message: 'A supported event type is required' },
    ]);
  }
  if (!Object.hasOwn(input, 'payload')) {
    throw new ValidationError('Invalid event payload', [
      { path: 'payload', message: 'Payload is required' },
    ]);
  }
  if (input.metadata !== undefined && (!input.metadata || typeof input.metadata !== 'object' || Array.isArray(input.metadata))) {
    throw new ValidationError('Invalid event metadata', [
      { path: 'metadata', message: 'Metadata must be an object' },
    ]);
  }

  const receivedAt = now();
  const metadata = { ...(input.metadata ?? {}), schemaVersion: '1.0' };
  const adapted = getSourceAdapter(input.source).adapt(input);
  const canonical = {
    eventId: input.eventId ?? `EV-${randomUUID().toUpperCase()}`,
    source: input.source,
    eventType: input.eventType,
    timestamp: normalizeTimestamp(input.timestamp, receivedAt, metadata),
    receivedAt,
    location: normalizeLocation(input),
    payload: adapted.payload,
    metadata,
  };

  const parsed = canonicalEventSchema.safeParse(canonical);
  if (!parsed.success) {
    throw new ValidationError('Canonical event validation failed', validationDetails(parsed.error));
  }
  return parsed.data;
}
