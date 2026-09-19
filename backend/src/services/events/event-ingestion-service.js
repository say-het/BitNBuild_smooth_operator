import { logger } from '../../config/logger.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { eventRepository } from '../../repositories/eventRepository.js';
import { ValidationError } from '../../errors/application-error.js';
import { eventIngestionMetrics } from './event-ingestion-metrics.js';
import { normalizeEvent } from './event-normalizer.js';

function repositoryData(canonical) {
  return {
    eventId: canonical.eventId,
    source: canonical.source,
    eventType: canonical.eventType,
    timestamp: canonical.timestamp,
    receivedAt: canonical.receivedAt,
    location: canonical.location,
    locationAccuracyMeters: canonical.location?.accuracyMeters,
    payload: canonical.payload,
    metadata: canonical.metadata,
    processingStatus: 'RECEIVED',
  };
}

export function createEventIngestionService({ repository = eventRepository, eventBus = domainEventBus, clock } = {}) {
  return {
    async ingest(input) {
      const startedAt = performance.now();
      eventIngestionMetrics.increment('received');
      let canonical;

      try {
        canonical = normalizeEvent(input, clock ? { now: clock } : undefined);
      } catch (error) {
        eventIngestionMetrics.increment('rejected');
        eventIngestionMetrics.observeLatency(performance.now() - startedAt);
        throw error;
      }

      try {
        const existing = await repository.findByEventId(canonical.eventId);
        if (existing) {
          eventIngestionMetrics.increment('duplicate');
          const durationMs = performance.now() - startedAt;
          eventIngestionMetrics.observeLatency(durationMs);
          logger.info(
            {
              eventId: existing.eventId,
              source: existing.source,
              eventType: existing.eventType,
              processingStatus: existing.processingStatus,
              durationMs,
              result: 'duplicate',
            },
            'event.ingestion.completed',
          );
          return { event: existing, created: false, duplicate: true };
        }

        let created;
        try {
          created = await repository.create(repositoryData(canonical));
        } catch (error) {
          if (error.code !== 'P2002') throw error;
          const duplicate = await repository.findByEventId(canonical.eventId);
          if (!duplicate) throw error;
          eventIngestionMetrics.increment('duplicate');
          eventIngestionMetrics.observeLatency(performance.now() - startedAt);
          return { event: duplicate, created: false, duplicate: true };
        }

        await eventBus.publish({
          type: 'EVENT_RECEIVED',
          eventId: created.eventId,
          source: created.source,
          eventType: created.eventType,
          occurredAt: created.receivedAt.toISOString(),
        });

        eventIngestionMetrics.increment('created');
        const durationMs = performance.now() - startedAt;
        eventIngestionMetrics.observeLatency(durationMs);
        logger.info(
          {
            eventId: created.eventId,
            source: created.source,
            eventType: created.eventType,
            processingStatus: created.processingStatus,
            durationMs,
            result: 'created',
          },
          'event.ingestion.completed',
        );
        return { event: created, created: true, duplicate: false };
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        eventIngestionMetrics.increment('failed');
        eventIngestionMetrics.observeLatency(performance.now() - startedAt);
        logger.error(
          { err: error, eventId: canonical.eventId, source: canonical.source, eventType: canonical.eventType },
          'event.ingestion.failed',
        );
        throw error;
      }
    },
  };
}

export const eventIngestionService = createEventIngestionService();
