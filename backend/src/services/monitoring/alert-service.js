import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { prisma } from '../../db/prisma.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { ApplicationError, NotFoundError } from '../../errors/application-error.js';
import { alertRepository } from '../../repositories/alertRepository.js';
import { auditRepository } from '../../repositories/auditRepository.js';
import { ALERT_SEVERITY_NAME } from './monitoring-config.js';

function id(prefix) {
  return `${prefix}-${randomUUID().toUpperCase()}`;
}

function conflict(message, details) {
  return new ApplicationError(message, { code: 'INVALID_ALERT_TRANSITION', statusCode: 409, details });
}

export function presentAlert(alert) {
  return {
    alertId: alert.alertId,
    dedupKey: alert.dedupKey,
    type: alert.type,
    severity: ALERT_SEVERITY_NAME[alert.severity] ?? 'INFO',
    severityLevel: alert.severity,
    title: alert.title,
    message: alert.message,
    status: alert.status,
    incidentId: alert.incident?.incidentId ?? null,
    resourceId: alert.resource?.resourceId ?? null,
    metadata: alert.metadata,
    acknowledgedAt: alert.acknowledgedAt,
    resolvedAt: alert.resolvedAt,
    createdAt: alert.createdAt,
    updatedAt: alert.updatedAt,
  };
}

export function presentRealtimeAlert(alert) {
  const data = presentAlert(alert);
  return {
    alertId: data.alertId,
    type: data.type,
    severity: data.severity,
    title: data.title,
    message: data.message,
    status: data.status,
    incidentId: data.incidentId,
    resourceId: data.resourceId,
    updatedAt: data.updatedAt,
  };
}

export function createAlertService({
  database = prisma,
  alerts = alertRepository,
  audits = auditRepository,
  eventBus = domainEventBus,
  now = () => new Date(),
} = {}) {
  async function publish(type, alert, correlationId) {
    const data = presentRealtimeAlert(alert);
    await eventBus.publish({
      type: type.toUpperCase().replace('.', '_'), occurredAt: now().toISOString(), alertId: alert.alertId,
      incidentId: data.incidentId, resourceId: data.resourceId, data, correlationId,
    });
  }

  const service = {
    async list(filters) {
      return (await alerts.findMany(filters)).map(presentAlert);
    },

    async get(alertId) {
      const alert = await alerts.findByAlertId(alertId);
      if (!alert) throw new NotFoundError('Alert not found');
      return presentAlert(alert);
    },

    async upsertCondition(condition, context = {}) {
      const detectedAt = now();
      let result;
      try {
        result = await database.$transaction(async (transaction) => {
          const existing = await alerts.findActiveByDedupKey(condition.key, transaction);
          if (existing) {
            const changed = existing.severity !== condition.severity
              || existing.title !== condition.title
              || existing.message !== condition.message;
            const updated = await alerts.updateDetection(existing.alertId, {
              severity: condition.severity,
              title: condition.title,
              message: condition.message,
              metadata: { ...(existing.metadata ?? {}), ...condition.metadata, source: 'MONITORING', lastDetectedAt: detectedAt.toISOString() },
            }, transaction);
            return { alert: updated, created: false, updated: changed };
          }
          const created = await alerts.create({
            alertId: id('ALT'),
            dedupKey: condition.key,
            type: condition.type,
            severity: condition.severity,
            title: condition.title,
            message: condition.message,
            incidentId: condition.incidentDbId ?? null,
            resourceId: condition.resourceDbId ?? null,
            metadata: { ...condition.metadata, source: 'MONITORING', firstDetectedAt: detectedAt.toISOString(), lastDetectedAt: detectedAt.toISOString() },
          }, transaction);
          await audits.create({
            auditId: id('AUD'), actorType: 'SYSTEM', actorId: 'monitoring-engine',
            action: 'ALERT_CREATED', entityType: 'ALERT', entityId: created.alertId,
            newState: { status: 'ACTIVE', type: created.type, severity: created.severity },
            metadata: { dedupKey: condition.key },
          }, transaction);
          return { alert: created, created: true, updated: false };
        });
      } catch (error) {
        if (error.code !== 'P2002') throw error;
        const existing = await alerts.findActiveByDedupKey(condition.key);
        if (!existing) throw error;
        result = { alert: existing, created: false, updated: false };
      }
      if (result.created || result.updated) {
        await publish(result.created ? 'alert.created' : 'alert.updated', result.alert, context.correlationId);
      }
      if (result.created) {
        logger.info({ alertId: result.alert.alertId, type: result.alert.type, incidentId: presentAlert(result.alert).incidentId }, 'notification.created');
      }
      return { ...result, data: presentAlert(result.alert) };
    },

    async acknowledge(alertId, context = {}) {
      const result = await database.$transaction(async (transaction) => {
        const existing = await alerts.findByAlertId(alertId, transaction);
        if (!existing) throw new NotFoundError('Alert not found');
        if (existing.status === 'ACKNOWLEDGED') return existing;
        if (existing.status !== 'ACTIVE') throw conflict(`Alert cannot be acknowledged from ${existing.status}`, { status: existing.status });
        const updated = await alerts.acknowledge(alertId, now(), transaction);
        await audits.create({
          auditId: id('AUD'), actorType: context.actorType ?? 'OPERATOR', actorId: context.actorId ?? null,
          action: 'ALERT_ACKNOWLEDGED', entityType: 'ALERT', entityId: alertId,
          previousState: { status: existing.status }, newState: { status: 'ACKNOWLEDGED' },
          metadata: context.reason ? { reason: context.reason } : undefined,
        }, transaction);
        return updated;
      });
      await publish('alert.updated', result, context.correlationId);
      return presentAlert(result);
    },

    async resolve(alertId, context = {}) {
      const result = await database.$transaction(async (transaction) => {
        const existing = await alerts.findByAlertId(alertId, transaction);
        if (!existing) throw new NotFoundError('Alert not found');
        if (existing.status === 'RESOLVED') return existing;
        if (!['ACTIVE', 'ACKNOWLEDGED'].includes(existing.status)) {
          throw conflict(`Alert cannot be resolved from ${existing.status}`, { status: existing.status });
        }
        const updated = await alerts.resolve(alertId, now(), transaction);
        await audits.create({
          auditId: id('AUD'), actorType: context.actorType ?? 'SYSTEM', actorId: context.actorId ?? 'monitoring-engine',
          action: 'ALERT_RESOLVED', entityType: 'ALERT', entityId: alertId,
          previousState: { status: existing.status }, newState: { status: 'RESOLVED' },
          metadata: context.reason ? { reason: context.reason } : undefined,
        }, transaction);
        return updated;
      });
      await publish('alert.resolved', result, context.correlationId);
      return presentAlert(result);
    },

    async resolveCleared(activeKeys, context = {}) {
      const managed = await alerts.findManagedActive();
      const preserveTypes = new Set(context.preserveTypes ?? []);
      const cleared = managed.filter(({ dedupKey, type }) => !activeKeys.has(dedupKey) && !preserveTypes.has(type));
      for (const alert of cleared) {
        await service.resolve(alert.alertId, {
          actorType: 'SYSTEM', actorId: 'monitoring-engine', reason: 'Monitoring condition cleared',
          correlationId: context.correlationId,
        });
      }
      return cleared.length;
    },
  };
  return service;
}

export const alertService = createAlertService();
