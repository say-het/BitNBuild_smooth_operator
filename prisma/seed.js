import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const capabilities = [
  ['fire_response', 'Fire response'],
  ['medical', 'Emergency medical care'],
  ['trauma', 'Trauma stabilization'],
  ['hazmat', 'Hazardous materials response'],
  ['water_rescue', 'Water rescue'],
  ['heavy_rescue', 'Heavy rescue'],
  ['police', 'Law enforcement'],
  ['evacuation', 'Evacuation support'],
  ['search_and_rescue', 'Search and rescue'],
];

const resources = [
  ['RES-AMB-01', 'Ambulance Alpha', 'AMBULANCE', 'AVAILABLE', 23.0301, 72.5582, ['medical', 'trauma']],
  ['RES-AMB-02', 'Ambulance Bravo', 'AMBULANCE', 'AVAILABLE', 23.0452, 72.5704, ['medical']],
  ['RES-AMB-03', 'Ambulance Charlie', 'AMBULANCE', 'MAINTENANCE', 23.0115, 72.5901, ['medical', 'trauma']],
  ['RES-FIRE-01', 'Fire Engine One', 'FIRE_TRUCK', 'AVAILABLE', 23.0258, 72.5873, ['fire_response', 'evacuation']],
  ['RES-FIRE-02', 'Fire Engine Two', 'FIRE_TRUCK', 'RESERVED', 23.0605, 72.5488, ['fire_response', 'heavy_rescue']],
  ['RES-POL-01', 'Police Unit Central', 'POLICE_UNIT', 'AVAILABLE', 23.0225, 72.5714, ['police', 'evacuation']],
  ['RES-POL-02', 'Police Unit East', 'POLICE_UNIT', 'AVAILABLE', 23.0348, 72.6122, ['police']],
  ['RES-RESCUE-01', 'Urban Rescue One', 'RESCUE_TEAM', 'AVAILABLE', 23.0182, 72.5641, ['search_and_rescue', 'heavy_rescue']],
  ['RES-MED-01', 'Mobile Medical Team', 'MEDICAL_TEAM', 'OFFLINE', 23.0404, 72.5566, ['medical', 'trauma']],
  ['RES-HAZ-01', 'Hazmat Response One', 'HAZMAT_TEAM', 'AVAILABLE', 22.9988, 72.6011, ['hazmat', 'fire_response']],
  ['RES-HELI-01', 'Air Rescue One', 'HELICOPTER', 'UNAVAILABLE', 23.0724, 72.6266, ['search_and_rescue', 'medical']],
  ['RES-EQP-01', 'Portable Flood Pumps', 'EQUIPMENT', 'AVAILABLE', 23.0072, 72.5354, ['water_rescue']],
];

const hospitals = [
  ['HSP-001', 'Horizon General Hospital', 'OPERATIONAL', 23.0538, 72.6034, 1800, 214, 120, 17, 80, 34, 18],
  ['HSP-002', 'Central Trauma Centre', 'OPERATIONAL', 23.0263, 72.5585, 1500, 168, 100, 23, 65, 27, 14],
  ['HSP-003', 'Westside Community Hospital', 'LIMITED', 23.0245, 72.5467, 250, 21, 36, 4, 24, 6, 6],
  ['HSP-004', 'Northstar Medical Centre', 'OPERATIONAL', 23.0717, 72.6093, 300, 54, 42, 9, 30, 12, 8],
  ['HSP-005', 'South Basin Hospital', 'OVERLOADED', 23.0069, 72.6065, 220, 8, 30, 1, 22, 2, 5],
  ['HSP-006', 'Forge District Hospital', 'OPERATIONAL', 23.0596, 72.5587, 550, 72, 60, 11, 38, 16, 10],
];

const sensors = [
  ['SNS-SMK-01', 'Warehouse Smoke North', 'SMOKE', 'ACTIVE', 'ppm', 23.0391, 72.5941],
  ['SNS-SMK-02', 'Industrial Smoke East', 'SMOKE', 'ACTIVE', 'ppm', 23.0154, 72.6312],
  ['SNS-WTR-01', 'North Basin Gauge', 'WATER_LEVEL', 'ACTIVE', 'm', 23.0632, 72.5788],
  ['SNS-WTR-02', 'Central Basin Gauge', 'WATER_LEVEL', 'ACTIVE', 'm', 23.0267, 72.5718],
  ['SNS-TMP-01', 'Market Temperature One', 'TEMPERATURE', 'ACTIVE', '°C', 23.0238, 72.5902],
  ['SNS-TMP-02', 'Depot Temperature Two', 'TEMPERATURE', 'FAULT', '°C', 23.0021, 72.5598],
  ['SNS-STR-01', 'Bridge Structural West', 'STRUCTURAL', 'ACTIVE', 'mm/s', 23.0439, 72.5511],
  ['SNS-STR-02', 'Overpass Structural East', 'STRUCTURAL', 'MAINTENANCE', 'mm/s', 23.0318, 72.6153],
  ['SNS-TRF-01', 'Arcway Boulevard Traffic', 'TRAFFIC', 'ACTIVE', 'vehicles/min', 23.0399, 72.5682],
  ['SNS-TRF-02', 'West Logistics Traffic', 'TRAFFIC', 'ACTIVE', 'vehicles/min', 23.0551, 72.5467],
  ['SNS-AIR-01', 'Air Quality Central', 'AIR_QUALITY', 'ACTIVE', 'AQI', 23.0225, 72.5714],
  ['SNS-AIR-02', 'Air Quality South', 'AIR_QUALITY', 'INACTIVE', 'AQI', 22.9892, 72.5844],
];

async function seedCapabilities() {
  for (const [code, name] of capabilities) {
    await prisma.capability.upsert({
      where: { code },
      update: { name },
      create: { code, name },
    });
  }
}

async function seedResources() {
  for (const [resourceId, name, type, status, lat, lng, capabilityCodes] of resources) {
    const resource = await prisma.resource.upsert({
      where: { resourceId },
      update: { name, type, status, latitude: lat, longitude: lng },
      create: {
        resourceId,
        name,
        type,
        status,
        latitude: lat,
        longitude: lng,
        homeBase: 'ResQai Synthetic Operations Region',
        availability: { shift: '24x7' },
        capacity: type === 'AMBULANCE' ? { patients: 2 } : { units: 1 },
      },
    });
    await prisma.$executeRaw`
      UPDATE resources SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${resource.id}::uuid
    `;
    for (const code of capabilityCodes) {
      const capability = await prisma.capability.findUniqueOrThrow({ where: { code } });
      await prisma.resourceCapability.upsert({
        where: { resourceId_capabilityId: { resourceId: resource.id, capabilityId: capability.id } },
        update: {},
        create: { resourceId: resource.id, capabilityId: capability.id },
      });
    }
  }
}

async function seedHospitals() {
  for (const row of hospitals) {
    const [hospitalId, name, status, lat, lng, totalBeds, availableBeds, icuBeds, availableIcuBeds, emergencyCapacity, availableEmergencyCapacity, ambulanceCapacity] = row;
    const data = {
      name,
      status,
      latitude: lat,
      longitude: lng,
      totalBeds,
      availableBeds,
      icuBeds,
      availableIcuBeds,
      emergencyCapacity,
      availableEmergencyCapacity,
      ambulanceCapacity,
      metadata: { region: 'Synthetic Emergency World' },
    };
    const hospital = await prisma.hospital.upsert({
      where: { hospitalId },
      update: data,
      create: { hospitalId, ...data },
    });
    await prisma.$executeRaw`
      UPDATE hospitals SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${hospital.id}::uuid
    `;
  }
}

async function seedSensors() {
  const observedAt = new Date('2026-09-19T08:00:00.000Z');
  for (const [sensorId, name, type, status, unit, lat, lng] of sensors) {
    const sensor = await prisma.sensor.upsert({
      where: { sensorId },
      update: { name, type, status, unit, latitude: lat, longitude: lng },
      create: {
        sensorId,
        name,
        type,
        status,
        unit,
        latitude: lat,
        longitude: lng,
        thresholds: { warning: 70, critical: 90 },
        metadata: { region: 'Synthetic Emergency World' },
      },
    });
    await prisma.$executeRaw`
      UPDATE sensors SET location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      WHERE id = ${sensor.id}::uuid
    `;
    await prisma.sensorReading.upsert({
      where: { readingId: `RDG-${sensorId}-001` },
      update: {},
      create: {
        readingId: `RDG-${sensorId}-001`,
        sensorId: sensor.id,
        timestamp: observedAt,
        value: type === 'AIR_QUALITY' ? 58 : 20,
        unit,
        quality: 'GOOD',
      },
    });
    await prisma.sensor.update({ where: { id: sensor.id }, data: { lastReadingAt: observedAt } });
  }
}

async function seedBaselineIncident() {
  const event = await prisma.event.upsert({
    where: { eventId: 'EV-SEED-001' },
    update: {},
    create: {
      eventId: 'EV-SEED-001',
      source: 'CITIZEN',
      eventType: 'EMERGENCY_REPORT',
      timestamp: new Date('2026-09-19T07:45:00.000Z'),
      latitude: 23.0391,
      longitude: 72.5941,
      payload: { text: 'Visible smoke near a warehouse loading area.' },
      processingStatus: 'PROCESSED',
    },
  });
  await prisma.$executeRaw`
    UPDATE events SET location = ST_SetSRID(ST_MakePoint(72.5941, 23.0391), 4326)::geography
    WHERE id = ${event.id}::uuid
  `;

  const incident = await prisma.incident.upsert({
    where: { incidentId: 'INC-SEED-001' },
    update: {},
    create: {
      incidentId: 'INC-SEED-001',
      type: 'FIRE',
      severity: 2,
      priority: 'P2',
      status: 'CREATED',
      confidence: 0.82,
      title: 'Warehouse smoke report',
      summary: 'Baseline verification incident; no active dispatch workflow is attached.',
      hazards: ['smoke'],
      latitude: 23.0391,
      longitude: 72.5941,
      detectedAt: new Date('2026-09-19T07:46:00.000Z'),
    },
  });
  await prisma.$executeRaw`
    UPDATE incidents SET location = ST_SetSRID(ST_MakePoint(72.5941, 23.0391), 4326)::geography
    WHERE id = ${incident.id}::uuid
  `;
  await prisma.incidentEvent.upsert({
    where: { incidentId_eventId: { incidentId: incident.id, eventId: event.id } },
    update: { confidence: 0.82 },
    create: {
      incidentId: incident.id,
      eventId: event.id,
      relationshipType: 'PRIMARY_SIGNAL',
      confidence: 0.82,
    },
  });

  const fireCapability = await prisma.capability.findUniqueOrThrow({ where: { code: 'fire_response' } });
  await prisma.incidentCapability.upsert({
    where: { incidentId_capabilityId: { incidentId: incident.id, capabilityId: fireCapability.id } },
    update: {},
    create: { incidentId: incident.id, capabilityId: fireCapability.id },
  });
  await prisma.alert.upsert({
    where: { alertId: 'ALT-SEED-001' },
    update: {},
    create: {
      alertId: 'ALT-SEED-001',
      type: 'SYSTEM',
      severity: 1,
      title: 'Database baseline ready',
      message: 'Deterministic seed completed successfully.',
      incidentId: incident.id,
      status: 'RESOLVED',
      createdAt: new Date('2026-09-19T07:59:00.000Z'),
      resolvedAt: new Date('2026-09-19T08:00:00.000Z'),
    },
  });
  await prisma.auditLog.upsert({
    where: { auditId: 'AUD-SEED-001' },
    update: {},
    create: {
      auditId: 'AUD-SEED-001',
      actorType: 'SYSTEM',
      action: 'DATABASE_SEEDED',
      entityType: 'Incident',
      entityId: incident.incidentId,
      newState: { status: incident.status },
    },
  });
}

async function main() {
  await seedCapabilities();
  await seedResources();
  await seedHospitals();
  await seedSensors();
  await seedBaselineIncident();

  const [resourceCount, hospitalCount, sensorCount] = await Promise.all([
    prisma.resource.count(),
    prisma.hospital.count(),
    prisma.sensor.count(),
  ]);
  console.log(`Seed complete: ${resourceCount} resources, ${hospitalCount} hospitals, ${sensorCount} sensors.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
