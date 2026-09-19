import { prisma } from '../db/prisma.js';
import { runInTransaction } from './runInTransaction.js';

export function createSensorRepository(database = prisma) {
  return {
    async create(data) {
      const { location, ...sensorData } = data;
      return runInTransaction(database, async (transaction) => {
        const sensor = await transaction.sensor.create({
          data: { ...sensorData, latitude: location.lat, longitude: location.lng },
        });
        await transaction.$executeRaw`
          UPDATE sensors
          SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
          WHERE id = ${sensor.id}::uuid
        `;
        return sensor;
      });
    },
    findBySensorId(sensorId) {
      return database.sensor.findUnique({ where: { sensorId } });
    },
    createReading(data) {
      return runInTransaction(database, async (transaction) => {
        const reading = await transaction.sensorReading.create({ data });
        await transaction.sensor.update({
          where: { id: data.sensorId },
          data: { lastReadingAt: data.timestamp },
        });
        return reading;
      });
    },
    findReadings(sensorId, limit = 100) {
      return database.sensorReading.findMany({
        where: { sensorId },
        orderBy: { timestamp: 'desc' },
        take: Math.min(limit, 1000),
      });
    },
  };
}

export const sensorRepository = createSensorRepository();
