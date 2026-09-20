import { domainEventBus } from '../events/domain-event-bus.js';
import { realtimeService } from './realtime-service.js';

const EVENT_MAP = Object.freeze({
  INCIDENT_CREATED: ['incident.created', 'incident'],
  INCIDENT_UPDATED: ['incident.updated', 'incident'],
  INCIDENT_STATE_CHANGED: ['incident.state_changed', 'incident'],
  INCIDENT_RESOLVED: ['incident.resolved', 'incident'],
  INCIDENT_ESCALATED: ['incident.escalated', 'incident'],
  RESOURCE_UPDATED: ['resource.updated', 'resource'],
  RESOURCE_LOCATION_UPDATED: ['resource.location_updated', 'resource'],
  RESOURCE_ASSIGNED: ['resource.assigned', 'resource'],
  RESOURCE_RELEASED: ['resource.released', 'resource'],
  ASSIGNMENT_CREATED: ['assignment.created', 'assignment'],
  ASSIGNMENT_STATUS_CHANGED: ['assignment.updated', 'assignment'],
  ALERT_CREATED: ['alert.created', 'alert'],
  ALERT_UPDATED: ['alert.updated', 'alert'],
  ALERT_RESOLVED: ['alert.resolved', 'alert'],
  HOSPITAL_UPDATED: ['hospital.updated', 'hospital'],
  SIMULATION_STARTED: ['simulation.started', 'simulation'],
  SIMULATION_PAUSED: ['simulation.paused', 'simulation'],
  SIMULATION_RESUMED: ['simulation.resumed', 'simulation'],
  SIMULATION_STOPPED: ['simulation.stopped', 'simulation'],
  SIMULATION_COMPLETED: ['simulation.completed', 'simulation'],
  SIMULATION_EVENT: ['simulation.event', 'simulation'],
  SIMULATION_RESET: ['simulation.reset', 'simulation'],
  SYSTEM_NOTIFICATION: ['system.notification', 'system'],
});

function clientEvent(domainEvent, mappedEvent) {
  if (domainEvent.type === 'INCIDENT_STATE_CHANGED' && domainEvent.data?.status === 'RESOLVED') return 'incident.resolved';
  if (domainEvent.type === 'ASSIGNMENT_STATUS_CHANGED' && domainEvent.data?.status === 'CANCELLED') return 'assignment.cancelled';
  return mappedEvent;
}

function entityId(event, kind) {
  return event[`${kind}Id`] ?? event.data?.[`${kind}Id`] ?? 'system';
}

function forward(event, service) {
  const [mappedEvent, kind] = EVENT_MAP[event.type];
  const name = clientEvent(event, mappedEvent);
  const id = entityId(event, kind);
  const metadata = { correlationId: event.correlationId, source: event.source ?? 'domain-event-bus' };
  return service[`emit${kind[0].toUpperCase()}${kind.slice(1)}Event`](name, id, event.data ?? {}, metadata);
}

export function registerRealtimeBridge({ eventBus = domainEventBus, service = realtimeService } = {}) {
  const unsubscribe = Object.keys(EVENT_MAP).map((type) => eventBus.subscribe(type, (event) => forward(event, service)));
  return () => unsubscribe.forEach((stop) => stop());
}

export { EVENT_MAP as REALTIME_DOMAIN_EVENT_MAP };
