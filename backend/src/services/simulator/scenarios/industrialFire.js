import { createScenario, observation as o } from './scenarioFactory.js';

export const industrialFireScenario = createScenario({
  id: 'INDUSTRIAL_FIRE',
  name: 'Forge Works Industrial Fire',
  description: 'A warehouse fire develops into a smoke, chemical, access, and casualty emergency.',
  defaultDuration: 240,
  groundTruth: (random) => [{
    incidentId: 'GT-FIRE-01', type: 'INDUSTRIAL_FIRE', location: { lat: 23.0412, lng: 72.5914 },
    startOffsetSeconds: 8, severity: 5, estimatedVictims: random.integer(7, 10),
    hazards: ['fire', 'smoke', 'chemical'], requiredCapabilities: ['fire_response', 'hazmat', 'medical'],
    facility: 'Forge Works Warehouse 7',
  }],
  timeline: () => [
    o(10, 'SENSOR', 'temperature_rising', 0, { temperature: 58, unit: 'C' }),
    o(20, 'SENSOR', 'smoke_anomaly', 0, { smokePpm: 82 }),
    o(25, 'CITIZEN', 'smoke_report'),
    o(35, 'EMERGENCY_CALL', 'fire_call'),
    o(45, 'CITIZEN', 'duplicate_fire_report'),
    o(60, 'SENSOR', 'critical_gas', 0, { smokePpm: 210, carbonMonoxidePpm: 95, temperature: 91 }),
    o(75, 'FIELD_TEAM', 'visible_flames'),
    o(90, 'CITIZEN', 'victims_reported'),
    o(120, 'GOVERNMENT', 'road_blocked', 0, { roadId: 'ROAD-FORGE' }),
    o(150, 'FIELD_TEAM', 'support_requested'),
    o(180, 'HOSPITAL', 'casualties_incoming'),
    o(200, 'WEATHER', 'wind_update', 0, { windSpeedKph: 28, windDirection: 'E' }),
    o(220, 'FIELD_TEAM', 'fire_spread'),
  ],
});
