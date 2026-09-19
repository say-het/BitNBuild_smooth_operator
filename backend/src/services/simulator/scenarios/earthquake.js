import { createScenario, observation as o } from './scenarioFactory.js';

export const earthquakeScenario = createScenario({
  id: 'EARTHQUAKE',
  name: 'North Span Seismic Event',
  description: 'One seismic event causes distinct damage incidents at multiple nearby locations.',
  defaultDuration: 260,
  groundTruth: (random) => [
    {
      incidentId: 'GT-QUAKE-01', type: 'BUILDING_COLLAPSE', location: { lat: 23.061, lng: 72.574 },
      startOffsetSeconds: 12, severity: 5, estimatedVictims: random.integer(12, 18), hazards: ['collapse', 'dust'],
      requiredCapabilities: ['heavy_rescue', 'search_and_rescue', 'medical'], facility: 'North Quarter Block C',
    },
    {
      incidentId: 'GT-QUAKE-02', type: 'INFRASTRUCTURE_FAILURE', location: { lat: 23.054, lng: 72.562 },
      startOffsetSeconds: 18, severity: 3, estimatedVictims: random.integer(1, 4), hazards: ['bridge_damage', 'traffic'],
      requiredCapabilities: ['police', 'heavy_rescue'], facility: 'North Span Bridge',
    },
    {
      incidentId: 'GT-QUAKE-03', type: 'BUILDING_DAMAGE', location: { lat: 23.066, lng: 72.586 },
      startOffsetSeconds: 24, severity: 3, estimatedVictims: random.integer(3, 7), hazards: ['structural_damage'],
      requiredCapabilities: ['search_and_rescue', 'evacuation'], facility: 'Orchard Residences',
    },
  ],
  timeline: () => [
    o(10, 'SENSOR', 'ground_vibration', 0, { groundAccelerationG: 0.41, vibrationMmS: 88 }),
    o(18, 'SENSOR', 'structural_stress', 1, { structuralStressMpa: 42 }),
    o(28, 'CITIZEN', 'collapse_report', 0),
    o(38, 'EMERGENCY_CALL', 'trapped_call', 0),
    o(48, 'CITIZEN', 'bridge_damage_report', 1),
    o(60, 'CITIZEN', 'building_damage_report', 2),
    o(75, 'SENSOR', 'aftershock', 0, { groundAccelerationG: 0.18, vibrationMmS: 35 }),
    o(95, 'GOVERNMENT', 'bridge_closed', 1, { roadId: 'ROAD-NORTH' }),
    o(120, 'FIELD_TEAM', 'trapped_victims', 0),
    o(145, 'FIELD_TEAM', 'separate_damage_confirmed', 2),
    o(175, 'FIELD_TEAM', 'rescue_requested', 0),
    o(205, 'HOSPITAL', 'mass_casualty_demand', 0),
    o(230, 'WEATHER', 'stable_weather', 0, { condition: 'clear' }),
  ],
});
