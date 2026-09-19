import { logger } from '../config/logger.js';

class DomainEventBus {
  #listeners = new Map();

  subscribe(type, listener) {
    const listeners = this.#listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(type, listeners);
    return () => listeners.delete(listener);
  }

  async publish(event) {
    const listeners = [...(this.#listeners.get(event.type) ?? [])];
    const results = await Promise.allSettled(
      listeners.map((listener) => Promise.resolve().then(() => listener(event))),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error(
          { err: result.reason, domainEventType: event.type, eventId: event.eventId },
          'Internal domain event listener failed',
        );
      }
    }
  }
}

export const domainEventBus = new DomainEventBus();
