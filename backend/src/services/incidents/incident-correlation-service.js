import { createHash } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { incidentCorrelationRepository } from '../../repositories/incidentCorrelationRepository.js';
import { CORRELATION_CONFIG } from './correlation-config.js';
import { chooseRelationship, scoreCorrelation } from './correlation-scorer.js';

const PRIORITY_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

function stableIncidentId(eventId) {
  return `INC-${createHash('sha256').update(eventId).digest('hex').slice(0, 12).toUpperCase()}`;
}

function maxNullable(left, right) {
  if (left === null || left === undefined) return right;
  if (right === null || right === undefined) return left;
  return Math.max(left, right);
}

function union(left = [], right = []) {
  return [...new Set([...left, ...right])].sort();
}

function incidentUpdate(incident, candidate) {
  const existingConfidence = incident.confidence === null ? null : Number(incident.confidence);
  const candidateConfidence = Number(candidate.confidence);
  const useCandidateNarrative = existingConfidence === null || candidateConfidence > existingConfidence;
  return {
    severity: Math.max(incident.severity, candidate.severity),
    priority: PRIORITY_RANK[candidate.priority] < PRIORITY_RANK[incident.priority] ? candidate.priority : incident.priority,
    confidence: Math.max(existingConfidence ?? 0, candidateConfidence),
    title: useCandidateNarrative ? candidate.title : incident.title,
    summary: useCandidateNarrative ? candidate.summary : incident.summary,
    estimatedVictims: maxNullable(incident.estimatedVictims, candidate.estimatedVictims),
    estimatedInjured: maxNullable(incident.estimatedInjured, candidate.estimatedInjured),
    estimatedTrapped: maxNullable(incident.estimatedTrapped, candidate.estimatedTrapped),
    hazards: union(incident.hazards, candidate.hazards),
  };
}

function operationalIncident(incident) {
  return {
    incidentId: incident.incidentId,
    title: incident.title,
    type: incident.type,
    severity: incident.severity,
    priority: incident.priority,
    status: incident.status,
    location: incident.latitude === null ? null : { lat: Number(incident.latitude), lng: Number(incident.longitude) },
    updatedAt: incident.updatedAt,
  };
}

export function createIncidentCorrelationService({
  repository = incidentCorrelationRepository,
  config = CORRELATION_CONFIG,
  eventBus = domainEventBus,
} = {}) {
  return {
    async correlate({ candidate, event }) {
      const current = await repository.findExistingByCandidate(candidate.id);
      if (current?.correlatedIncident) {
        return { action: current.correlationStatus, incident: current.correlatedIncident, correlation: current.correlationMetadata, reprocessed: true };
      }
      const existingLink = await repository.findExistingEventLink(event.id);
      if (existingLink) {
        const correlation = existingLink.correlationMetadata ?? { decision: 'REPROCESSED', score: Number(existingLink.correlationScore ?? 1), matchedSignals: ['existing_event_link'], reason: 'Event was already linked to an incident.' };
        const incident = await repository.markCandidateCorrelated(candidate.id, existingLink.incidentId, correlation);
        return { action: 'CORRELATED', incident, correlation, reprocessed: true };
      }

      const matches = await repository.findNearbyActiveIncidents({
        latitude: candidate.latitude === null ? null : Number(candidate.latitude),
        longitude: candidate.longitude === null ? null : Number(candidate.longitude),
        timestamp: event.timestamp,
        radiusMeters: config.maxDistanceMeters,
        timeWindowSeconds: config.maxTimeDifferenceSeconds,
      });
      const scored = matches
        .map((incident) => ({ incident, correlation: scoreCorrelation(candidate, incident, config) }))
        .sort((left, right) => right.correlation.score - left.correlation.score);
      const best = scored.find(({ correlation }) => correlation.decision === 'CORRELATED');

      if (!best) {
        const considered = scored.slice(0, 3).map(({ incident, correlation }) => ({ incidentId: incident.incidentId, score: correlation.score, decision: correlation.decision }));
        const correlation = {
          decision: 'NEW_INCIDENT', score: 1, matchedSignals: ['primary_signal'],
          reason: scored.length ? 'No active incident reached the configured high-match threshold.' : 'No active incident was within the spatial and temporal search window.',
          thresholds: config.thresholds, considered,
        };
        const incident = await repository.createIncident({ incidentId: stableIncidentId(event.eventId), candidate, event, correlation });
        await eventBus.publish({
          type: 'INCIDENT_CREATED', occurredAt: new Date().toISOString(), incidentId: incident.incidentId,
          data: operationalIncident(incident), correlationId: event.correlationId,
        });
        logger.info({ eventId: event.eventId, incidentId: incident.incidentId, decision: 'NEW_INCIDENT' }, 'incident.correlation.completed');
        return { action: 'NEW_INCIDENT', incident, correlation, relationshipType: 'PRIMARY_SIGNAL' };
      }

      const relationshipType = chooseRelationship({ event, match: best.incident, score: best.correlation }, config);
      const correlation = { ...best.correlation, relationshipType, thresholds: config.thresholds };
      const incident = await repository.updateIncident({
        incident: best.incident,
        candidate,
        event,
        relationshipType,
        correlation,
        update: incidentUpdate(best.incident, candidate),
      });
      await eventBus.publish({
        type: 'INCIDENT_UPDATED', occurredAt: new Date().toISOString(), incidentId: incident.incidentId,
        data: operationalIncident(incident), correlationId: event.correlationId,
      });
      logger.info({ eventId: event.eventId, incidentId: incident.incidentId, score: correlation.score, relationshipType }, 'incident.correlation.completed');
      return { action: 'CORRELATED', incident, correlation, relationshipType };
    },
  };
}

export const incidentCorrelationService = createIncidentCorrelationService();
