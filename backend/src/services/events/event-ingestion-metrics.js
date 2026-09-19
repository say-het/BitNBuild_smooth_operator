const counters = {
  received: 0,
  created: 0,
  duplicate: 0,
  rejected: 0,
  failed: 0,
  totalLatencyMs: 0,
};

export const eventIngestionMetrics = {
  increment(name) {
    counters[name] += 1;
  },
  observeLatency(durationMs) {
    counters.totalLatencyMs += durationMs;
  },
  snapshot() {
    return Object.freeze({ ...counters });
  },
};
