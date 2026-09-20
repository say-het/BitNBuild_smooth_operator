export function observedLocation(truth, random, accuracyMeters) {
  const offset = accuracyMeters / 111_000;
  return {
    lat: Number((truth.location.lat + (random.next() - 0.5) * offset).toFixed(6)),
    lng: Number((truth.location.lng + (random.next() - 0.5) * offset).toFixed(6)),
    accuracyMeters,
  };
}

export function baseEvent(context, source, eventType, location, payload) {
  return {
    eventId: `${context.runId}-${String(context.sequence).padStart(4, '0')}`,
    source,
    eventType,
    timestamp: context.now().toISOString(),
    location,
    payload,
    metadata: {
      sourceId: `synthetic-${source.toLowerCase()}-${context.sequence}`,
      synthetic: true,
      simulationRunId: context.runId,
      scenario: context.scenario,
      simulationTimeSeconds: context.timelineEvent.at,
    },
  };
}
