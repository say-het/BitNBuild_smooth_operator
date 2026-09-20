export const SYNTHETIC_WORLD = Object.freeze({
  name: 'ResQai Synthetic Emergency World',
  disclaimer: 'Fictional operational geography; coordinates do not represent a named city.',
  bounds: { south: 23.0, north: 23.08, west: 72.54, east: 72.62 },
  zones: [
    { id: 'ZONE-IND', name: 'Nova Industrial District', type: 'INDUSTRIAL', center: { lat: 23.0412, lng: 72.5914 }, risks: ['FIRE_RISK', 'HAZMAT'] },
    { id: 'ZONE-RES', name: 'North Residential Quarter', type: 'RESIDENTIAL', center: { lat: 23.062, lng: 72.574 }, risks: ['EARTHQUAKE_RISK'] },
    { id: 'ZONE-CBD', name: 'Central Exchange District', type: 'COMMERCIAL', center: { lat: 23.034, lng: 72.578 }, risks: [] },
    { id: 'ZONE-MED', name: 'Horizon Medical District', type: 'MEDICAL', center: { lat: 23.052, lng: 72.603 }, risks: [] },
    { id: 'ZONE-TRN', name: 'West Logistics Corridor', type: 'TRANSPORT', center: { lat: 23.028, lng: 72.552 }, risks: ['FIRE_RISK'] },
    { id: 'ZONE-RIV', name: 'South River Basin', type: 'RIVER_BASIN', center: { lat: 23.012, lng: 72.581 }, risks: ['FLOOD_RISK'] },
  ],
  roads: [
    { roadId: 'ROAD-ARC', name: 'Arcway Boulevard', geometry: [[72.545, 23.028], [72.61, 23.033]], status: 'OPEN', capacity: 1800 },
    { roadId: 'ROAD-FORGE', name: 'Forge Road', geometry: [[72.578, 23.039], [72.606, 23.044]], status: 'OPEN', capacity: 900 },
    { roadId: 'ROAD-RIVER', name: 'Riverbank Link', geometry: [[72.55, 23.01], [72.608, 23.016]], status: 'OPEN', capacity: 700 },
    { roadId: 'ROAD-NORTH', name: 'North Span', geometry: [[72.566, 23.055], [72.592, 23.071]], status: 'OPEN', capacity: 1100 },
  ],
});

export function createWorldState({ resources = [], hospitals = [] } = {}) {
  return {
    ...SYNTHETIC_WORLD,
    roads: SYNTHETIC_WORLD.roads.map((road) => ({ ...road })),
    resources: resources.map(({ resourceId, status, latitude, longitude }) => ({ resourceId, status, latitude, longitude })),
    hospitals: hospitals.map(({ hospitalId, status, availableBeds, availableIcuBeds, availableEmergencyCapacity }) => ({
      hospitalId,
      status,
      availableBeds,
      availableIcuBeds,
      availableEmergencyCapacity,
    })),
  };
}
