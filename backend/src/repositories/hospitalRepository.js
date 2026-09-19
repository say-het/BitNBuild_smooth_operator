import { prisma } from '../db/prisma.js';
import { runInTransaction } from './runInTransaction.js';

export function createHospitalRepository(database = prisma) {
  return {
    async create(data) {
      const { location, ...hospitalData } = data;
      return runInTransaction(database, async (transaction) => {
        const hospital = await transaction.hospital.create({
          data: { ...hospitalData, latitude: location.lat, longitude: location.lng },
        });
        await transaction.$executeRaw`
          UPDATE hospitals
          SET location = ST_SetSRID(ST_MakePoint(${location.lng}, ${location.lat}), 4326)::geography
          WHERE id = ${hospital.id}::uuid
        `;
        return hospital;
      });
    },
    findByHospitalId(hospitalId) {
      return database.hospital.findUnique({ where: { hospitalId } });
    },
    findAll() {
      return database.hospital.findMany({
        orderBy: [{ status: 'asc' }, { name: 'asc' }],
        select: {
          hospitalId: true,
          name: true,
          status: true,
          latitude: true,
          longitude: true,
          totalBeds: true,
          availableBeds: true,
          icuBeds: true,
          availableIcuBeds: true,
          emergencyCapacity: true,
          availableEmergencyCapacity: true,
          ambulanceCapacity: true,
          statusUpdatedAt: true,
        },
      });
    },
    updateCapacity(hospitalId, capacity) {
      return database.hospital.update({
        where: { hospitalId },
        data: { ...capacity, statusUpdatedAt: new Date() },
      });
    },
  };
}

export const hospitalRepository = createHospitalRepository();
