import { createScenario, observation as o } from './scenarioFactory.js';

export const floodScenario = createScenario({
  id: 'FLOOD',
  name: 'South Basin Flash Flood',
  description: 'Sustained rainfall raises river levels, blocks roads, and drives evacuation and hospital demand.',
  defaultDuration: 240,
  groundTruth: (random) => [{
    incidentId: 'GT-FLOOD-01', type: 'FLOOD', location: { lat: 23.012, lng: 72.581 },
    startOffsetSeconds: 15, severity: 4, estimatedVictims: random.integer(10, 16),
    hazards: ['floodwater', 'debris', 'electrical'], requiredCapabilities: ['water_rescue', 'evacuation', 'medical'],
    affectedArea: 'South River Basin',
  }],
  timeline: () => [
    o(5, 'WEATHER', 'heavy_rain', 0, { rainfallMmPerHour: 72 }),
    o(20, 'SENSOR', 'water_rising', 0, { waterLevelMeters: 2.2, flowRateM3s: 160 }),
    o(35, 'SENSOR', 'flood_threshold', 0, { waterLevelMeters: 3.5, flowRateM3s: 240 }),
    o(45, 'CITIZEN', 'flood_report'),
    o(60, 'EMERGENCY_CALL', 'flood_call'),
    o(80, 'CITIZEN', 'duplicate_flood_report'),
    o(100, 'GOVERNMENT', 'road_closed', 0, { roadId: 'ROAD-RIVER' }),
    o(125, 'FIELD_TEAM', 'evacuation_needed'),
    o(155, 'FIELD_TEAM', 'water_rescue_requested'),
    o(190, 'HOSPITAL', 'casualties_incoming'),
    o(220, 'WEATHER', 'rain_easing', 0, { rainfallMmPerHour: 39 }),
  ],
});
