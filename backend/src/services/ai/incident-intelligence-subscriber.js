import { logger } from '../../config/logger.js';
import { eventRepository } from '../../repositories/eventRepository.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { incidentIntelligenceService } from './incident-intelligence-service.js';
import { citizenImageStore } from '../uploads/citizen-image-store.js';

export function registerIncidentIntelligenceSubscriber({
  eventBus = domainEventBus,
  events = eventRepository,
  service = incidentIntelligenceService,
  imageStore = citizenImageStore,
  defer = (operation) => setImmediate(operation),
} = {}) {
  return eventBus.subscribe('EVENT_RECEIVED', (domainEvent) => {
    defer(async () => {
      let event;
      try {
        event = await events.findByEventId(domainEvent.eventId);
        if (!event) {
          logger.error({ eventId: domainEvent.eventId }, 'incident_intelligence.event_not_found');
          return;
        }
        await service.analyzeEvent(event);
      } catch (error) {
        logger.error({ err: error, eventId: domainEvent.eventId }, 'incident_intelligence.subscriber_failed');
      } finally {
        await imageStore.remove(event?.payload?.image);
      }
    });
  });
}
