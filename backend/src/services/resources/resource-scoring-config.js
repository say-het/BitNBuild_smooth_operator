export const RESOURCE_SCORE_WEIGHTS = Object.freeze({
  capabilityMatch: 0.35,
  eta: 0.25,
  distance: 0.1,
  capacity: 0.1,
  availability: 0.05,
  workload: 0.1,
  incidentPriority: 0.05,
});

export const RESOURCE_SCORE_LIMITS = Object.freeze({
  etaMinutes: 60,
  distanceMeters: 50_000,
  capacity: 10,
});
