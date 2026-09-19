import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './db/prisma.js';
import { registerSocketHandlers } from './sockets/index.js';
import { initializeRedisAdapter } from './sockets/redis-adapter.js';
import { registerRealtimeBridge } from './sockets/realtime-bridge.js';
import { realtimeService } from './sockets/realtime-service.js';
import { simulatorService } from './services/simulator/simulatorService.js';
import { registerIncidentIntelligenceSubscriber } from './services/ai/incident-intelligence-subscriber.js';
import { monitoringService } from './services/monitoring/monitoring-service.js';
import { twitterConnector } from './TwitterConnector/connector.js';

const app = createApp();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: env.CLIENT_URL, credentials: true },
});
let unsubscribeIncidentIntelligence;
let unsubscribeRealtime;
let closeRedisAdapter = async () => {};

registerSocketHandlers(io);

async function start() {
  try {
    await connectDatabase();
    closeRedisAdapter = await initializeRedisAdapter(io);
    unsubscribeRealtime = registerRealtimeBridge();
    unsubscribeIncidentIntelligence = registerIncidentIntelligenceSubscriber();
    monitoringService.start();
    twitterConnector.start();
    httpServer.listen(env.PORT, () => {
      logger.info({ port: env.PORT, environment: env.NODE_ENV }, 'ResQai API listening');
    });
  } catch (error) {
    logger.fatal({ err: error }, 'Backend startup failed');
    process.exitCode = 1;
  }
}

await start();

httpServer.on('error', (error) => {
  logger.fatal({ err: error }, 'HTTP server failed');
  process.exitCode = 1;
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  simulatorService.shutdown();
  monitoringService.stop();
  twitterConnector.stop();
  unsubscribeIncidentIntelligence?.();
  unsubscribeRealtime?.();

  if (!httpServer.listening) {
    realtimeService.shutdown();
    await closeRedisAdapter();
    await disconnectDatabase();
    process.exitCode = 1;
    return;
  }

  io.close(async () => {
    realtimeService.shutdown();
    await closeRedisAdapter();
    await disconnectDatabase();
    logger.info('Graceful shutdown complete');
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (error) => {
  logger.error({ err: error }, 'Unhandled promise rejection');
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  shutdown('uncaughtException');
});
