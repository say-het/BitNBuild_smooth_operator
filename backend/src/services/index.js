// Stable modular-monolith boundaries. Domain implementations are added in later prompts.
export const SERVICE_BOUNDARIES = Object.freeze([
  'ai',
  'incidents',
  'correlation',
  'resources',
  'optimization',
  'geo',
  'monitoring',
  'orchestration',
  'notifications',
  'simulator',
]);
