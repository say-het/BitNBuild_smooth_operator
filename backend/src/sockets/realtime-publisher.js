import { realtimeService } from './realtime-service.js';

export const realtimePublisher = {
  setServer(io) {
    realtimeService.setServer(io);
  },
  emit(type, aggregateId, data, { correlationId } = {}) {
    return realtimeService.emit(type, aggregateId, data, { correlationId });
  },
};
