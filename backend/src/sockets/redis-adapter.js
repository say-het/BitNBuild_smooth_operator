import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { realtimeService } from './realtime-service.js';

export async function initializeRedisAdapter(io, { service = realtimeService } = {}) {
  if (!env.REALTIME_REDIS_ENABLED) {
    service.setRedisAdapter('disabled');
    return async () => {};
  }
  if (!env.REDIS_URL) {
    service.setRedisAdapter('fallback');
    logger.warn({ reason: 'REDIS_URL_MISSING' }, 'realtime.redis_fallback');
    return async () => {};
  }

  const options = {
    url: env.REDIS_URL,
    socket: { connectTimeout: env.REALTIME_REDIS_CONNECT_TIMEOUT_MS, reconnectStrategy: false },
  };
  const publisher = createClient(options);
  const subscriber = publisher.duplicate();
  const onError = (error) => {
    service.setRedisAdapter('degraded');
    logger.error({ err: error }, 'realtime.redis_error');
  };
  publisher.on('error', onError);
  subscriber.on('error', onError);

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    io.adapter(createAdapter(publisher, subscriber));
    service.setRedisAdapter('connected');
    logger.info('realtime.redis_connected');
  } catch (error) {
    service.setRedisAdapter('fallback');
    logger.warn({ err: error }, 'realtime.redis_fallback');
    await Promise.allSettled([publisher.close(), subscriber.close()]);
    return async () => {};
  }

  return async () => {
    await Promise.allSettled([publisher.close(), subscriber.close()]);
  };
}
