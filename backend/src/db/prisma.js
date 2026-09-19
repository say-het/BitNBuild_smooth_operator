import { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const globalDatabase = globalThis;

export const prisma =
  globalDatabase.__resqaiPrisma ??
  new PrismaClient({
    log:
      env.NODE_ENV === 'test'
        ? []
        : env.NODE_ENV === 'development'
        ? [
            { emit: 'event', level: 'warn' },
            { emit: 'event', level: 'error' },
          ]
        : [{ emit: 'event', level: 'error' }],
  });

if (env.NODE_ENV !== 'test') {
  prisma.$on('warn', (event) => logger.warn({ databaseMessage: event.message }, 'Prisma warning'));
  prisma.$on('error', (event) => logger.error({ databaseMessage: event.message }, 'Prisma error'));
}

if (env.NODE_ENV !== 'production') globalDatabase.__resqaiPrisma = prisma;

export async function connectDatabase() {
  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Database connection established');
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  logger.info('Database connection closed');
}

export function withTransaction(operation, options) {
  return prisma.$transaction((transaction) => operation(transaction), options);
}
