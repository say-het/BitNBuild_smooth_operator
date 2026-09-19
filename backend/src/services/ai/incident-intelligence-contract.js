import { z } from 'zod';

export const INCIDENT_TYPES = Object.freeze([
  'FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE', 'MEDICAL_EMERGENCY', 'HAZMAT',
  'BUILDING_COLLAPSE', 'INFRASTRUCTURE_FAILURE', 'OTHER',
]);

export const SUPPORTED_CAPABILITIES = Object.freeze([
  'fire_response', 'medical', 'trauma', 'hazmat', 'water_rescue', 'heavy_rescue',
  'search_and_rescue', 'police', 'evacuation',
]);

const nullableCount = z.number().int().nonnegative().max(100_000).nullable();
const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict().nullable();

export const rawIncidentCandidateSchema = z.object({
  incidentType: z.enum(INCIDENT_TYPES),
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(5).max(1_000),
  severity: z.number().int().min(1).max(5),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  confidence: z.number().finite().min(0).max(1),
  estimatedVictims: nullableCount,
  estimatedInjured: nullableCount,
  estimatedTrapped: nullableCount,
  hazards: z.array(z.string().trim().min(1).max(60)).max(20),
  requiredCapabilities: z.array(z.enum(SUPPORTED_CAPABILITIES)).max(SUPPORTED_CAPABILITIES.length),
  location: locationSchema,
  locationConfidence: z.number().finite().min(0).max(1).nullable(),
  evidence: z.array(z.string().trim().min(1).max(240)).min(1).max(10),
}).strict();

export const GEMINI_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['incidentType', 'title', 'summary', 'severity', 'priority', 'confidence', 'estimatedVictims', 'estimatedInjured', 'estimatedTrapped', 'hazards', 'requiredCapabilities', 'location', 'locationConfidence', 'evidence'],
  properties: {
    incidentType: { type: 'string', enum: INCIDENT_TYPES },
    title: { type: 'string' },
    summary: { type: 'string' },
    severity: { type: 'integer', minimum: 1, maximum: 5 },
    priority: { type: 'string', enum: ['P0', 'P1', 'P2', 'P3'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    estimatedVictims: { type: ['integer', 'null'], minimum: 0 },
    estimatedInjured: { type: ['integer', 'null'], minimum: 0 },
    estimatedTrapped: { type: ['integer', 'null'], minimum: 0 },
    hazards: { type: 'array', items: { type: 'string' }, maxItems: 20 },
    requiredCapabilities: { type: 'array', items: { type: 'string', enum: SUPPORTED_CAPABILITIES }, maxItems: SUPPORTED_CAPABILITIES.length },
    location: { type: ['object', 'null'], properties: { lat: { type: 'number', minimum: -90, maximum: 90 }, lng: { type: 'number', minimum: -180, maximum: 180 } }, required: ['lat', 'lng'], additionalProperties: false },
    locationConfidence: { type: ['number', 'null'], minimum: 0, maximum: 1 },
    evidence: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10 },
  },
});

export function priorityForSeverity(severity) {
  if (severity === 5) return 'P0';
  if (severity === 4) return 'P1';
  if (severity === 3) return 'P2';
  return 'P3';
}

export function validateAndNormalizeCandidate(raw, eventLocation) {
  const parsed = rawIncidentCandidateSchema.parse(raw);
  const location = eventLocation ?? parsed.location;
  return {
    ...parsed,
    priority: priorityForSeverity(parsed.severity),
    hazards: [...new Set(parsed.hazards.map((hazard) => hazard.toLowerCase().replaceAll(/\s+/g, '_')))].sort(),
    requiredCapabilities: [...new Set(parsed.requiredCapabilities)].sort(),
    evidence: [...new Set(parsed.evidence)],
    location,
    locationConfidence: location ? (eventLocation ? 1 : parsed.locationConfidence) : null,
  };
}
