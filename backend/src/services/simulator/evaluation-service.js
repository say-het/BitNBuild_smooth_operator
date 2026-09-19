import { NotFoundError } from '../../errors/application-error.js';
import { calculateStraightLineDistance } from '../geo/geo-service.js';
import { simulationRepository } from '../../repositories/simulationRepository.js';
import { instantiateScenario } from './scenarioEngine.js';

const TYPE_NORMALIZATION = Object.freeze({ INDUSTRIAL_FIRE: 'FIRE', BUILDING_DAMAGE: 'OTHER' });

function expectedType(type) {
  return TYPE_NORMALIZATION[type] ?? type;
}

function expectedPriority(severity) {
  if (severity === 5) return 'P0';
  if (severity === 4) return 'P1';
  if (severity === 3) return 'P2';
  return 'P3';
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : null;
}

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function majorityIncident(events) {
  const counts = events.reduce((result, event) => {
    if (event.incidentId) result.set(event.incidentId, (result.get(event.incidentId) ?? 0) + 1);
    return result;
  }, new Map());
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function correlationMetrics(events) {
  const linked = events.filter(({ incidentId, groundTruthId }) => incidentId && groundTruthId);
  let correctMerges = 0;
  let incorrectMerges = 0;
  let missedMerges = 0;
  for (let left = 0; left < linked.length; left += 1) {
    for (let right = left + 1; right < linked.length; right += 1) {
      const sameTruth = linked[left].groundTruthId === linked[right].groundTruthId;
      const sameIncident = linked[left].incidentId === linked[right].incidentId;
      if (sameTruth && sameIncident) correctMerges += 1;
      else if (!sameTruth && sameIncident) incorrectMerges += 1;
      else if (sameTruth && !sameIncident) missedMerges += 1;
    }
  }
  const precision = ratio(correctMerges, correctMerges + incorrectMerges);
  const recall = ratio(correctMerges, correctMerges + missedMerges);
  return {
    evaluatedSignals: linked.length,
    correctMerges, incorrectMerges, missedMerges, precision, recall,
    f1: precision === null || recall === null || precision + recall === 0 ? null : Number((2 * precision * recall / (precision + recall)).toFixed(3)),
  };
}

function responseMetrics(assignments) {
  const firstResponses = new Map();
  for (const assignment of assignments) {
    if (!assignment.arrivedAt) continue;
    const seconds = (new Date(assignment.arrivedAt) - new Date(assignment.detectedAt)) / 1_000;
    if (seconds >= 0 && (!firstResponses.has(assignment.incidentId) || seconds < firstResponses.get(assignment.incidentId))) {
      firstResponses.set(assignment.incidentId, seconds);
    }
  }
  const values = [...firstResponses.values()];
  return {
    averageFirstResponseMinutes: values.length ? Number((average(values) / 60).toFixed(1)) : null,
    sampleSize: values.length,
  };
}

export function createSimulationEvaluationService({ repository = simulationRepository } = {}) {
  return {
    async evaluate(runId) {
      const run = await repository.findByRunId(runId);
      if (!run) throw new NotFoundError('Simulation run not found');
      const [truthRows, operationalEvents, assignments] = await Promise.all([
        repository.getGroundTruth(runId), repository.getEvaluationOperationalEvents(runId), repository.getEvaluationAssignments(runId),
      ]);
      const instantiated = instantiateScenario(run.scenarioType, run.seed);
      const timeline = [...instantiated.timeline].sort((left, right) => left.at - right.at || left.order - right.order);
      const truthById = new Map(truthRows.map((row) => [row.groundTruthId, row.truth]));
      const eventTruth = new Map(timeline.map((item, index) => [
        `${runId}-${String(index + 1).padStart(4, '0')}`,
        instantiated.groundTruth[item.incident]?.incidentId,
      ]));
      const events = operationalEvents.map((event) => ({ ...event, groundTruthId: eventTruth.get(event.eventId) ?? null }));
      const incidentById = new Map(events.filter(({ incidentId }) => incidentId).map((event) => [event.incidentId, event]));
      const matches = [];
      for (const [groundTruthId, truth] of truthById) {
        const truthEvents = events.filter((event) => event.groundTruthId === groundTruthId);
        const incidentId = majorityIncident(truthEvents);
        const detected = incidentById.get(incidentId);
        const required = new Set(truth.requiredCapabilities ?? []);
        const detectedCapabilities = new Set(detected?.incidentCapabilities ?? []);
        const covered = [...required].filter((capability) => detectedCapabilities.has(capability));
        const firstLinkedTime = Math.min(...truthEvents.filter(({ incidentId: id }) => id).map(({ simulationTimeSeconds }) => simulationTimeSeconds).filter(Number.isFinite));
        matches.push({
          groundTruthId,
          detectedIncidentId: incidentId,
          expectedType: expectedType(truth.type),
          detectedType: detected?.incidentType ?? null,
          typeCorrect: detected ? detected.incidentType === expectedType(truth.type) : false,
          severityDifference: detected ? detected.incidentSeverity - truth.severity : null,
          priorityCorrect: detected ? detected.incidentPriority === expectedPriority(truth.severity) : false,
          locationErrorMeters: detected?.incidentLatitude === null || detected?.incidentLatitude === undefined ? null : Math.round(calculateStraightLineDistance(
            truth.location,
            { lat: Number(detected.incidentLatitude), lng: Number(detected.incidentLongitude) },
          )),
          detectionDelaySeconds: Number.isFinite(firstLinkedTime) ? Math.max(0, firstLinkedTime - (truth.startOffsetSeconds ?? 0)) : null,
          requiredCapabilities: [...required],
          coveredCapabilities: covered,
          missingCapabilities: [...required].filter((capability) => !detectedCapabilities.has(capability)),
          linkedSignals: truthEvents.filter(({ incidentId: id }) => id).length,
        });
      }
      const detectedMatches = matches.filter(({ detectedIncidentId }) => detectedIncidentId);
      const locationErrors = matches.map(({ locationErrorMeters }) => locationErrorMeters).filter((value) => value !== null);
      const detectionDelays = matches.map(({ detectionDelaySeconds }) => detectionDelaySeconds).filter((value) => value !== null);
      const requiredCount = matches.reduce((total, match) => total + match.requiredCapabilities.length, 0);
      const coveredCount = matches.reduce((total, match) => total + match.coveredCapabilities.length, 0);
      const byType = matches.reduce((result, match) => {
        const item = result[match.expectedType] ?? { expected: 0, detected: 0, correct: 0 };
        item.expected += 1;
        item.detected += match.detectedIncidentId ? 1 : 0;
        item.correct += match.typeCorrect ? 1 : 0;
        result[match.expectedType] = item;
        return result;
      }, {});
      return {
        syntheticBenchmark: true,
        disclaimer: 'Synthetic simulation metrics; not real-world performance claims.',
        run: { runId, scenario: run.scenarioType, status: run.status, eventsGenerated: run.eventsGenerated },
        coverage: { groundTruthIncidents: matches.length, detectedMatches: detectedMatches.length, matchRate: ratio(detectedMatches.length, matches.length) },
        classification: { accuracy: ratio(matches.filter(({ typeCorrect }) => typeCorrect).length, matches.length), byType },
        correlation: correlationMetrics(events),
        location: { medianErrorMeters: median(locationErrors), averageErrorMeters: average(locationErrors) === null ? null : Math.round(average(locationErrors)), sampleSize: locationErrors.length },
        detection: { averageDelaySeconds: average(detectionDelays) === null ? null : Number(average(detectionDelays).toFixed(1)), sampleSize: detectionDelays.length },
        severity: { meanAbsoluteDifference: detectedMatches.length ? Number((average(detectedMatches.map(({ severityDifference }) => Math.abs(severityDifference))) ?? 0).toFixed(2)) : null },
        priority: { accuracy: ratio(matches.filter(({ priorityCorrect }) => priorityCorrect).length, matches.length) },
        capabilities: { coveragePercent: requiredCount ? Number((coveredCount / requiredCount * 100).toFixed(1)) : null, required: requiredCount, covered: coveredCount, missing: matches.flatMap(({ missingCapabilities }) => missingCapabilities) },
        response: responseMetrics(assignments),
        observations: { generated: operationalEvents.length, linked: events.filter(({ incidentId }) => incidentId).length },
        matches,
      };
    },
  };
}

export const simulationEvaluationService = createSimulationEvaluationService();
