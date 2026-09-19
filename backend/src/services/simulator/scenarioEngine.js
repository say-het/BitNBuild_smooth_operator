import { ValidationError } from '../../errors/application-error.js';
import { validateGroundTruth } from './groundTruth.js';
import { scenarioRegistry } from './scenarioRegistry.js';
import { SeededRandom } from './seededRandom.js';

export function instantiateScenario(scenarioId, seed) {
  const scenario = scenarioRegistry.get(scenarioId);
  if (!scenario) {
    throw new ValidationError('Invalid simulation scenario', [
      { path: 'scenario', message: `Unsupported scenario: ${scenarioId}` },
    ]);
  }
  const groundTruth = validateGroundTruth(scenario.createGroundTruth(new SeededRandom(seed)));
  const timeline = scenario.buildTimeline(new SeededRandom(seed + 1));
  return { scenario, groundTruth, timeline, initialState: scenario.generateInitialState() };
}
