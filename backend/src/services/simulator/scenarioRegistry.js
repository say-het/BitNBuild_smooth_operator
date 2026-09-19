import { earthquakeScenario } from './scenarios/earthquake.js';
import { floodScenario } from './scenarios/flood.js';
import { industrialFireScenario } from './scenarios/industrialFire.js';
import { roadAccidentScenario } from './scenarios/roadAccident.js';

const scenarios = new Map([
  industrialFireScenario,
  floodScenario,
  roadAccidentScenario,
  earthquakeScenario,
].map((scenario) => [scenario.id, scenario]));

export const scenarioRegistry = Object.freeze({
  get(id) {
    return scenarios.get(id);
  },
  list() {
    return [...scenarios.values()];
  },
});
