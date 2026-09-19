function observation(at, source, kind, incident = 0, parameters = {}) {
  return { at, source, kind, incident, parameters };
}

export { observation };

export function createScenario(definition) {
  return Object.freeze({
    ...definition,
    createGroundTruth(random) {
      return definition.groundTruth(random);
    },
    buildTimeline(random) {
      return definition.timeline(random).map((item, order) => ({ ...item, order }));
    },
    generateInitialState() {
      return { phase: 'BASELINE', activeHazards: [], affectedRoads: [] };
    },
  });
}
