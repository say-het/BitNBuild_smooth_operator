import { logger } from '../../config/logger.js';
import { hospitalRepository } from '../../repositories/hospitalRepository.js';
import { incidentRepository } from '../../repositories/incidentRepository.js';
import { resourceIntelligenceService } from '../resources/resource-intelligence-service.js';
import { alertService } from './alert-service.js';
import { escalationService } from './escalation-service.js';
import { ALERT_SEVERITY, MONITORING_CONFIG } from './monitoring-config.js';
import {
  accountForAssignedCoverage,
  addMultipleFailureEscalations,
  evaluateAssignmentRules,
  evaluateHospitalRules,
  evaluateIncidentRules,
  evaluateShortageRules,
} from './monitoring-rules.js';

function systemCondition(component, error) {
  return {
    key: `MONITORING_SYSTEM:${component}`,
    type: 'SYSTEM',
    severity: ALERT_SEVERITY.HIGH,
    title: `${component} monitoring unavailable`,
    message: `The monitoring cycle could not evaluate ${component}.`,
    escalation: false,
    metadata: { condition: 'MONITORING_COMPONENT_FAILED', component, errorCode: error.code ?? 'DEPENDENCY_FAILED' },
  };
}

function routeConditions(incident) {
  return incident.assignments.flatMap((assignment) => {
    const roadStatus = assignment.metadata?.route?.roadStatus;
    return roadStatus ? [{ assignmentId: assignment.assignmentId, resourceId: assignment.resource.resourceId, roadStatus }] : [];
  });
}

export function createMonitoringService({
  incidents = incidentRepository,
  hospitals = hospitalRepository,
  intelligence = resourceIntelligenceService,
  alerts = alertService,
  escalation = escalationService,
  config = MONITORING_CONFIG,
  now = () => new Date(),
} = {}) {
  let running = false;
  let timer;
  let lastRunAt = null;
  let lastRunDurationMs = null;
  let lastRunSummary = null;
  let lastError = null;

  const service = {
    async run(context = {}) {
      if (running) return { skipped: true, reason: 'MONITORING_ALREADY_RUNNING', ...lastRunSummary };
      running = true;
      const startedAt = now();
      try {
        const activeIncidents = await incidents.findActiveForMonitoring();
        const incidentIds = activeIncidents.map(({ incidentId }) => incidentId);
        let conditions = activeIncidents.flatMap((incident) => [
          ...evaluateIncidentRules(incident, config, startedAt),
          ...evaluateAssignmentRules(incident, config, startedAt),
        ]);
        const preserveTypes = [];
        let plan = { assignments: [], shortages: [] };

        if (incidentIds.length) {
          try {
            plan = await intelligence.recommend(incidentIds);
            plan = { ...plan, shortages: accountForAssignedCoverage(activeIncidents, plan.shortages) };
            conditions.push(...evaluateShortageRules(activeIncidents, plan.shortages));
          } catch (error) {
            logger.warn({ err: error }, 'monitoring.resource_intelligence_failed');
            conditions.push(systemCondition('resource intelligence', error));
            preserveTypes.push('RESOURCE_SHORTAGE');
          }
        }

        try {
          conditions.push(...evaluateHospitalRules(await hospitals.findAll(), config));
        } catch (error) {
          logger.warn({ err: error }, 'monitoring.hospital_capacity_failed');
          conditions.push(systemCondition('hospital capacity', error));
          preserveTypes.push('HOSPITAL_OVERLOAD');
        }

        conditions.push(...addMultipleFailureEscalations(activeIncidents, conditions));
        conditions = [...new Map(conditions.map((item) => [item.key, item])).values()];

        const results = [];
        for (const item of conditions) results.push({ condition: item, ...(await alerts.upsertCondition(item, context)) });
        const activeKeys = new Set(conditions.map(({ key }) => key));
        const alertsResolved = await alerts.resolveCleared(activeKeys, { preserveTypes, correlationId: context.correlationId });

        let escalationsTriggered = 0;
        if (config.escalationEnabled) {
          const incidentById = new Map(activeIncidents.map((incident) => [incident.incidentId, incident]));
          for (const result of results.filter(({ condition, created }) => condition.escalation && condition.incidentId && created)) {
            const incident = incidentById.get(result.condition.incidentId);
            escalationsTriggered += 1;
            await escalation.analyze({
              incident,
              alert: result.alert,
              alternatives: plan.assignments.filter(({ incidentId }) => incidentId === incident.incidentId),
              shortages: plan.shortages.filter(({ incidentId }) => incidentId === incident.incidentId),
              routeConditions: routeConditions(incident),
            }, context);
          }
        }

        lastRunSummary = {
          incidentsChecked: activeIncidents.length,
          assignmentsChecked: activeIncidents.reduce((count, incident) => count + incident.assignments.length, 0),
          conditionsDetected: conditions.length,
          alertsCreated: results.filter(({ created }) => created).length,
          alertsUpdated: results.filter(({ updated }) => updated).length,
          alertsResolved,
          escalationsTriggered,
        };
        lastRunAt = startedAt;
        lastRunDurationMs = now().getTime() - startedAt.getTime();
        lastError = null;
        logger.info({ ...lastRunSummary, durationMs: lastRunDurationMs }, 'monitoring.cycle_completed');
        return lastRunSummary;
      } catch (error) {
        lastRunAt = startedAt;
        lastRunDurationMs = now().getTime() - startedAt.getTime();
        lastError = error.code ?? 'MONITORING_CYCLE_FAILED';
        logger.error({ err: error, durationMs: lastRunDurationMs }, 'monitoring.cycle_failed');
        throw error;
      } finally {
        running = false;
      }
    },

    start() {
      if (!config.enabled || timer) return false;
      timer = setInterval(() => {
        service.run().catch(() => {});
      }, config.intervalMs);
      timer.unref();
      setImmediate(() => service.run().catch(() => {}));
      return true;
    },

    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },

    status() {
      return {
        enabled: config.enabled,
        running,
        intervalMs: config.intervalMs,
        lastRunAt,
        lastRunDurationMs,
        lastRunSummary,
        lastError,
      };
    },
  };
  return service;
}

export const monitoringService = createMonitoringService();
