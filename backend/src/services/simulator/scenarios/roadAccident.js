import { createScenario, observation as o } from './scenarioFactory.js';

export const roadAccidentScenario = createScenario({
  id: 'ROAD_ACCIDENT',
  name: 'Arcway Multi-Vehicle Collision',
  description: 'A high-impact collision creates multiple casualty reports and corridor congestion.',
  defaultDuration: 190,
  groundTruth: (random) => [{
    incidentId: 'GT-ROAD-01', type: 'ROAD_ACCIDENT', location: { lat: 23.031, lng: 72.566 },
    startOffsetSeconds: 10, severity: 4, estimatedVictims: random.integer(5, 8),
    hazards: ['traffic', 'fuel_leak'], requiredCapabilities: ['medical', 'trauma', 'police'],
    vehiclesInvolved: 4,
  }],
  timeline: () => [
    o(5, 'SENSOR', 'traffic_normal', 0, { trafficSpeedKph: 54, congestion: 0.12 }),
    o(12, 'SENSOR', 'impact_detected', 0, { impactG: 6.8, trafficSpeedKph: 8 }),
    o(22, 'CITIZEN', 'accident_report'),
    o(30, 'EMERGENCY_CALL', 'accident_call'),
    o(42, 'CITIZEN', 'duplicate_accident_report'),
    o(55, 'SENSOR', 'traffic_congestion', 0, { trafficSpeedKph: 3, congestion: 0.94 }),
    o(75, 'GOVERNMENT', 'lane_blocked', 0, { roadId: 'ROAD-ARC' }),
    o(95, 'FIELD_TEAM', 'multiple_casualties'),
    o(125, 'FIELD_TEAM', 'ambulance_requested'),
    o(160, 'HOSPITAL', 'casualties_incoming'),
  ],
});
