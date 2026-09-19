import { SUPPORTED_CAPABILITIES } from './incident-intelligence-contract.js';

export const INCIDENT_INTELLIGENCE_SYSTEM_PROMPT = `You are ResQai Incident Intelligence. Analyze only the supplied canonical emergency evidence.
Return exactly the requested JSON structure. Use null for unknown casualty counts or location. Do not invent victims, injuries, trapped people, hazards, or coordinates. Keep evidence concise and quote or paraphrase only observable factors; never provide chain-of-thought.
Severity: 1 low/no immediate danger; 2 limited emergency; 3 significant emergency; 4 high-risk emergency; 5 critical immediate threat to life or major hazard.
Priority must be P0, P1, P2, or P3. Suggested capabilities must come only from: ${SUPPORTED_CAPABILITIES.join(', ')}.
For attached images, describe only visible evidence such as smoke, flames, flood water, collision damage, structural damage, crowds, or visible hazards. Preserve uncertainty when ambiguous. Never infer an exact victim count, chemical identity, or medical diagnosis from an image alone.
Do not assign resources, dispatch teams, choose routes, modify state, optimize, or send notifications. Your output is a candidate for deterministic validation and later correlation.`;

export function buildIncidentEvidencePrompt(event) {
  const { image, ...payload } = event.payload ?? {};
  const safeEvent = {
    eventId: event.eventId,
    source: event.source,
    eventType: event.eventType,
    timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
    location: event.latitude === null || event.latitude === undefined
      ? (event.location ?? null)
      : { lat: Number(event.latitude), lng: Number(event.longitude) },
    payload: { ...payload, ...(image ? { imageAttached: true, imageMimeType: image.mimeType } : {}) },
  };
  return `Analyze this canonical event as evidence for one incident candidate:\n${JSON.stringify(safeEvent)}`;
}
