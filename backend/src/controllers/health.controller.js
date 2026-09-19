import { prisma } from '../db/prisma.js';

export async function getHealth(_request, response) {
  await prisma.$queryRaw`SELECT 1`;
  response.status(200).json({
    status: 'ok',
    service: 'resqai-api',
    database: 'connected',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
  });
}
