import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { roomsFor } from './room-contract.js';

const ENTITY_TYPES = Object.freeze({
  incident: 'INCIDENT',
  resource: 'RESOURCE',
  assignment: 'ASSIGNMENT',
  alert: 'ALERT',
  hospital: 'HOSPITAL',
  simulation: 'SIMULATION',
  system: 'SYSTEM',
});

function entityTypeFor(event) {
  return ENTITY_TYPES[event.split('.')[0]] ?? 'SYSTEM';
}

export function createRealtimeService({
  now = () => new Date(),
  locationThrottleMs = env.REALTIME_LOCATION_THROTTLE_MS,
  instanceId = randomUUID(),
} = {}) {
  let io;
  let sequence = 0;
  let redisAdapter = 'disabled';
  const locationState = new Map();

  function deliver(event, entityType, entityId, data, metadata = {}) {
    const timestamp = now().toISOString();
    const eventId = randomUUID();
    const envelope = {
      event,
      timestamp,
      entityType,
      entityId,
      data,
      version: 1,
      sequence: ++sequence,
      metadata: {
        source: metadata.source ?? 'backend',
        instanceId,
        ...(metadata.correlationId ? { correlationId: metadata.correlationId } : {}),
      },
      // Compatibility aliases for the Prompt 09 envelope; new clients use the fields above.
      eventId,
      aggregateId: entityId,
    };
    try {
      if (typeof io?.to === 'function') io.to(roomsFor(entityType, entityId, data)).emit(event, envelope);
      else io?.emit(event, envelope);
    } catch (error) {
      logger.error({ err: error, event, entityType, entityId }, 'realtime.emit_failed');
    }
    return envelope;
  }

  function emitLocation(event, entityId, data, metadata) {
    const current = locationState.get(entityId);
    const time = now().getTime();
    if (!current || time - current.lastSentAt >= locationThrottleMs) {
      current?.timer && clearTimeout(current.timer);
      locationState.set(entityId, { lastSentAt: time, timer: null, pending: null });
      return deliver(event, 'RESOURCE', entityId, data, metadata);
    }
    current.pending = { event, data, metadata };
    if (!current.timer) {
      current.timer = setTimeout(() => {
        const latest = locationState.get(entityId);
        if (!latest?.pending) return;
        const pending = latest.pending;
        latest.pending = null;
        latest.timer = null;
        latest.lastSentAt = now().getTime();
        deliver(pending.event, 'RESOURCE', entityId, pending.data, pending.metadata);
      }, Math.max(0, locationThrottleMs - (time - current.lastSentAt)));
      current.timer.unref?.();
    }
    return null;
  }

  const service = {
    setServer(server) {
      io = server;
    },
    setRedisAdapter(status) {
      redisAdapter = status;
    },
    emit(event, entityId, data, metadata = {}) {
      const entityType = metadata.entityType ?? entityTypeFor(event);
      if (event === 'resource.location_updated') return emitLocation(event, entityId, data, metadata);
      return deliver(event, entityType, entityId, data, metadata);
    },
    emitIncidentEvent(event, incidentId, data, metadata) {
      return service.emit(event, incidentId, data, { ...metadata, entityType: 'INCIDENT' });
    },
    emitResourceEvent(event, resourceId, data, metadata) {
      return service.emit(event, resourceId, data, { ...metadata, entityType: 'RESOURCE' });
    },
    emitAssignmentEvent(event, assignmentId, data, metadata) {
      return service.emit(event, assignmentId, data, { ...metadata, entityType: 'ASSIGNMENT' });
    },
    emitAlertEvent(event, alertId, data, metadata) {
      return service.emit(event, alertId, data, { ...metadata, entityType: 'ALERT' });
    },
    emitHospitalEvent(event, hospitalId, data, metadata) {
      return service.emit(event, hospitalId, data, { ...metadata, entityType: 'HOSPITAL' });
    },
    emitSimulationEvent(event, runId, data, metadata) {
      return service.emit(event, runId, data, { ...metadata, entityType: 'SIMULATION' });
    },
    emitSystemEvent(event, entityId, data, metadata) {
      return service.emit(event, entityId, data, { ...metadata, entityType: 'SYSTEM' });
    },
    status() {
      return {
        socketIo: io ? 'ready' : 'not_ready',
        redisAdapter,
        connectedClients: io?.engine?.clientsCount ?? 0,
        locationThrottleMs,
        sequence,
      };
    },
    shutdown() {
      for (const state of locationState.values()) if (state.timer) clearTimeout(state.timer);
      locationState.clear();
      io = undefined;
    },
  };
  return service;
}

export const realtimeService = createRealtimeService();
