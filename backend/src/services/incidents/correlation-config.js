export const CORRELATION_CONFIG = Object.freeze({
  maxDistanceMeters: 5_000,
  maxTimeDifferenceSeconds: 30 * 60,
  weights: Object.freeze({ geographic: 0.3, temporal: 0.2, type: 0.25, semantic: 0.15, hazardCapability: 0.1 }),
  thresholds: Object.freeze({ highMatch: 0.7, mediumMatch: 0.55, duplicateSemantic: 0.8 }),
  duplicate: Object.freeze({ maxDistanceMeters: 250, maxTimeDifferenceSeconds: 5 * 60 }),
});
