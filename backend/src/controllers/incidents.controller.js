import { z } from 'zod';
import { NotFoundError, ValidationError } from '../errors/application-error.js';
import { incidentRepository } from '../repositories/incidentRepository.js';
import { presentEvent } from '../services/events/event-presenter.js';
import { incidentStateService } from '../services/incidents/incident-state-service.js';

const transitionSchema = z.object({
  status: z.enum(['CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVING', 'RESOLVED', 'DELAYED', 'ESCALATED', 'REOPTIMIZED', 'CANCELLED']),
  actorType: z.enum(['OPERATOR', 'SYSTEM', 'AI_AGENT', 'RESPONDER', 'SIMULATOR', 'INTEGRATION']).optional().default('OPERATOR'),
  actorId: z.string().trim().min(1).max(128).nullable().optional(),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
}).strict();

function validationDetails(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function presentIncident(incident) {
  return {
    incidentId: incident.incidentId,
    type: incident.type,
    severity: incident.severity,
    priority: incident.priority,
    status: incident.status,
    confidence: incident.confidence === null ? null : Number(incident.confidence),
    title: incident.title,
    summary: incident.summary,
    estimatedVictims: incident.estimatedVictims,
    estimatedInjured: incident.estimatedInjured,
    estimatedTrapped: incident.estimatedTrapped,
    hazards: incident.hazards ?? [],
    ...(incident.latitude === null || incident.latitude === undefined ? {} : { location: { lat: Number(incident.latitude), lng: Number(incident.longitude) } }),
    detectedAt: incident.detectedAt,
    resolvedAt: incident.resolvedAt,
    createdAt: incident.createdAt,
    updatedAt: incident.updatedAt,
    requiredCapabilities: incident.requiredCapabilities?.map(({ capability }) => capability) ?? [],
    eventCount: incident._count?.events ?? incident.events?.length ?? 0,
  };
}

export async function listIncidents(_request, response) {
  const incidents = await incidentRepository.findActive();
  response.status(200).json({ success: true, data: incidents.map(presentIncident), meta: { count: incidents.length } });
}

export async function getIncident(request, response) {
  const incident = await incidentRepository.findByIncidentId(request.params.incidentId);
  if (!incident) throw new NotFoundError('Incident not found');
  response.status(200).json({ success: true, data: presentIncident(incident) });
}

export async function getIncidentEvents(request, response) {
  const incident = await incidentRepository.findByIncidentId(request.params.incidentId);
  if (!incident) throw new NotFoundError('Incident not found');
  const relationships = await incidentRepository.findEvents(request.params.incidentId);
  response.status(200).json({
    success: true,
    data: relationships.map((relationship) => ({
      relationshipType: relationship.relationshipType,
      confidence: relationship.confidence === null ? null : Number(relationship.confidence),
      correlationScore: relationship.correlationScore === null ? null : Number(relationship.correlationScore),
      correlation: relationship.correlationMetadata,
      event: presentEvent(relationship.event),
    })),
    meta: { count: relationships.length },
  });
}

export async function transitionIncident(request, response) {
  const parsed = transitionSchema.safeParse(request.body);
  if (!parsed.success) throw new ValidationError('Invalid incident transition request', validationDetails(parsed.error));
  const { status, ...context } = parsed.data;
  const incident = await incidentStateService.transition(request.params.incidentId, status, context);
  response.status(200).json({ success: true, data: presentIncident(incident) });
}
