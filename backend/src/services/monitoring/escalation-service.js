import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { logger } from '../../config/logger.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { auditRepository } from '../../repositories/auditRepository.js';
import { alertRepository } from '../../repositories/alertRepository.js';
import { resourceRepository } from '../../repositories/resourceRepository.js';
import { geminiClient, GeminiClientError } from '../ai/gemini-client.js';
import { ESCALATION_RESPONSE_SCHEMA, escalationOutputSchema } from './escalation-contract.js';
import { buildEscalationPrompt, ESCALATION_SYSTEM_PROMPT } from './escalation-prompt.js';
import { presentAlert, presentRealtimeAlert } from './alert-service.js';

const RESOURCE_ACTIONS = new Set(['ASSIGN_RESOURCE', 'REASSIGN_RESOURCE']);

function auditId() {
  return `AUD-${randomUUID().toUpperCase()}`;
}

function incidentInput(incident) {
  return {
    incidentId: incident.incidentId,
    type: incident.type,
    title: incident.title,
    priority: incident.priority,
    severity: incident.severity,
    status: incident.status,
    hazards: incident.hazards,
    requiredCapabilities: incident.requiredCapabilities.map(({ capability, quantity }) => ({ code: capability.code, quantity })),
  };
}

function assignmentInput(assignment) {
  return {
    assignmentId: assignment.assignmentId,
    resourceId: assignment.resource.resourceId,
    status: assignment.status,
    estimatedArrival: assignment.estimatedArrival,
    resourceStatus: assignment.resource.status,
  };
}

async function validateAction(action, incident, alternatives, resources) {
  if (!RESOURCE_ACTIONS.has(action.type)) return { valid: true, action };
  if (!action.resourceId) return { valid: false, action, reason: 'Resource action requires resourceId' };
  const candidate = alternatives.find(({ resourceId }) => resourceId === action.resourceId);
  if (!candidate || !Number.isFinite(candidate.etaMinutes)) {
    return { valid: false, action, reason: 'Resource is not an ETA-ranked eligible alternative' };
  }
  const resource = await resources.findByResourceId(action.resourceId);
  if (!resource || resource.status !== 'AVAILABLE' || resource.currentIncidentId) {
    return { valid: false, action, reason: 'Resource is not currently available' };
  }
  const required = new Set(incident.requiredCapabilities.map(({ capability }) => capability.code));
  const capabilities = resource.capabilities.map(({ capability }) => capability.code);
  if (!capabilities.some((code) => required.has(code))) {
    return { valid: false, action, reason: 'Resource does not cover an incident capability' };
  }
  return { valid: true, action: { ...action, validation: { etaMinutes: candidate.etaMinutes, capabilities } } };
}

function safeFailure(error) {
  if (error instanceof ZodError) return 'AI_INVALID_OUTPUT';
  if (error instanceof GeminiClientError) return error.code;
  return 'ESCALATION_ANALYSIS_FAILED';
}

export function createEscalationService({
  client = geminiClient,
  resources = resourceRepository,
  alerts = alertRepository,
  audits = auditRepository,
  eventBus = domainEventBus,
} = {}) {
  return {
    async analyze({ incident, alert, alternatives = [], shortages = [], routeConditions = [] }, context = {}) {
      await audits.create({
        auditId: auditId(), actorType: 'SYSTEM', actorId: 'monitoring-engine',
        action: 'ESCALATION_REQUESTED', entityType: 'ALERT', entityId: alert.alertId,
        newState: { incidentId: incident.incidentId, alertType: alert.type },
      });
      try {
        const prompt = buildEscalationPrompt({
          incident: incidentInput(incident),
          assignments: incident.assignments.map(assignmentInput),
          alert: presentAlert(alert),
          availableAlternatives: alternatives,
          routeConditions,
          resourceShortages: shortages,
        });
        const generated = await client.generateStructured(prompt, {
          systemPrompt: ESCALATION_SYSTEM_PROMPT,
          responseSchema: ESCALATION_RESPONSE_SCHEMA,
        });
        const recommendation = escalationOutputSchema.parse(generated.output);
        const validation = await Promise.all(
          recommendation.recommendedActions.map((action) => validateAction(action, incident, alternatives, resources)),
        );
        const acceptedActions = validation.filter(({ valid }) => valid).map(({ action }) => action);
        const rejectedActions = validation.filter(({ valid }) => !valid);

        for (const rejected of rejectedActions) {
          await audits.create({
            auditId: auditId(), actorType: 'SYSTEM', actorId: 'escalation-validator',
            action: 'ESCALATION_RECOMMENDATION_REJECTED', entityType: 'ALERT', entityId: alert.alertId,
            previousState: { recommendation: rejected.action }, newState: { accepted: false },
            metadata: { reason: rejected.reason },
          });
        }

        const result = {
          escalationRequired: recommendation.escalationRequired,
          urgency: recommendation.urgency,
          reason: recommendation.reason,
          recommendedActions: acceptedActions,
          rejectedActionCount: rejectedActions.length,
          provider: client.provider,
          model: client.model,
        };
        const currentAlert = await alerts.findByAlertId(alert.alertId);
        if (!currentAlert || !['ACTIVE', 'ACKNOWLEDGED'].includes(currentAlert.status)) {
          await audits.create({
            auditId: auditId(), actorType: 'SYSTEM', actorId: 'escalation-validator',
            action: 'ESCALATION_RECOMMENDATION_REJECTED', entityType: 'ALERT', entityId: alert.alertId,
            newState: { accepted: false }, metadata: { reason: 'ALERT_NO_LONGER_ACTIVE' },
          });
          return { status: 'REJECTED', errorCode: 'ALERT_NO_LONGER_ACTIVE' };
        }
        await audits.create({
          auditId: auditId(), actorType: 'AI_AGENT', actorId: client.model,
          action: 'ESCALATION_RECOMMENDATION_PRODUCED', entityType: 'ALERT', entityId: alert.alertId,
          newState: result,
        });
        const updatedAlert = await alerts.updateDetection(alert.alertId, {
          metadata: { ...(currentAlert.metadata ?? {}), escalation: result },
        });
        await eventBus.publish({
          type: 'ESCALATION_RECOMMENDATION_PRODUCED', occurredAt: new Date().toISOString(),
          incidentId: incident.incidentId, alertId: alert.alertId,
        });
        await eventBus.publish({
          type: 'ALERT_UPDATED', occurredAt: new Date().toISOString(), alertId: alert.alertId,
          incidentId: incident.incidentId, resourceId: updatedAlert.resource?.resourceId ?? null,
          data: presentRealtimeAlert(updatedAlert), correlationId: context.correlationId,
        });
        if (result.escalationRequired) {
          await eventBus.publish({
            type: 'INCIDENT_ESCALATED', occurredAt: new Date().toISOString(), incidentId: incident.incidentId,
            data: {
              incidentId: incident.incidentId, alertId: alert.alertId, urgency: result.urgency,
              reason: result.reason, recommendedActions: result.recommendedActions, recommendationOnly: true,
            },
            correlationId: context.correlationId,
          });
        }
        return { status: rejectedActions.length && acceptedActions.length === 0 ? 'REJECTED' : 'COMPLETED', ...result };
      } catch (error) {
        const errorCode = safeFailure(error);
        await audits.create({
          auditId: auditId(), actorType: 'SYSTEM', actorId: 'escalation-validator',
          action: 'ESCALATION_RECOMMENDATION_REJECTED', entityType: 'ALERT', entityId: alert.alertId,
          newState: { accepted: false }, metadata: { reason: errorCode },
        });
        logger.warn({ err: error, alertId: alert.alertId, incidentId: incident.incidentId, errorCode }, 'escalation.analysis_failed');
        return { status: 'FAILED', errorCode };
      }
    },
  };
}

export const escalationService = createEscalationService();
