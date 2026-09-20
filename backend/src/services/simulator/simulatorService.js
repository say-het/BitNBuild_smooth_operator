import { randomUUID } from 'node:crypto';
import { logger } from '../../config/logger.js';
import { domainEventBus } from '../../events/domain-event-bus.js';
import { ApplicationError, NotFoundError, ValidationError } from '../../errors/application-error.js';
import { hospitalRepository } from '../../repositories/hospitalRepository.js';
import { resourceRepository } from '../../repositories/resourceRepository.js';
import { simulationRepository } from '../../repositories/simulationRepository.js';
import { eventIngestionService } from '../events/event-ingestion-service.js';
import { EventScheduler } from './eventScheduler.js';
import { generateSourceEvent } from './eventGenerator.js';
import { instantiateScenario } from './scenarioEngine.js';
import { SeededRandom } from './seededRandom.js';
import { SimulationClock } from './simulationClock.js';
import { createWorldState } from './worldState.js';

const ALLOWED_TIME_SCALES = new Set([1, 5, 10, 20]);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'STOPPED', 'FAILED']);

function stateError(message) {
  return new ApplicationError(message, { code: 'INVALID_SIMULATION_STATE', statusCode: 409 });
}

export function createSimulatorService({
  repository = simulationRepository,
  ingestionService = eventIngestionService,
  resources = resourceRepository,
  hospitals = hospitalRepository,
  eventBus = domainEventBus,
  now = () => new Date(),
  tickMilliseconds = 100,
} = {}) {
  const runtimes = new Map();

  function publish(type, run, extra = {}) {
    return eventBus.publish({
      type, occurredAt: now().toISOString(), simulationId: run.runId,
      data: {
        runId: run.runId, scenario: run.scenarioType, status: run.status,
        simulationTime: run.simulationTime, eventsGenerated: run.eventsGenerated, ...extra,
      },
      source: 'simulator',
    });
  }

  async function requireRun(runId) {
    const run = await repository.findByRunId(runId);
    if (!run) throw new NotFoundError('Simulation run not found');
    return run;
  }

  async function buildRuntime(run) {
    const instantiated = instantiateScenario(run.scenarioType, run.seed);
    const [truthRows, resourceRows, hospitalRows] = await Promise.all([
      repository.getGroundTruth(run.runId),
      resources.findAll(),
      hospitals.findAll(),
    ]);
    const runtime = {
      run,
      scenario: instantiated.scenario,
      truth: truthRows.map((row) => row.truth),
      resources: resourceRows,
      hospitals: hospitalRows,
      scheduler: new EventScheduler(instantiated.timeline, run.nextEventIndex),
      clock: new SimulationClock({ timeScale: run.timeScale, initialTime: run.simulationTime }),
      timer: null,
      processing: false,
      processingPromise: null,
    };
    runtimes.set(run.runId, runtime);
    return runtime;
  }

  async function getRuntime(run) {
    return runtimes.get(run.runId) ?? buildRuntime(run);
  }

  function clearLoop(runtime) {
    if (runtime.timer) clearInterval(runtime.timer);
    runtime.timer = null;
  }

  async function fail(runtime, timelineEvent, error) {
    clearLoop(runtime);
    runtime.clock.stop();
    runtime.run = await repository.update(runtime.run.runId, {
      status: 'FAILED',
      simulationTime: Math.floor(runtime.clock.getElapsedTime()),
      nextEventIndex: runtime.scheduler.nextEventIndex,
      endedAt: now(),
      failure: {
        simulationTime: timelineEvent?.at ?? runtime.clock.getElapsedTime(),
        source: timelineEvent?.source,
        eventKind: timelineEvent?.kind,
        message: error.message,
      },
    });
    logger.error({ err: error, runId: runtime.run.runId, simulationTime: timelineEvent?.at }, 'simulation.event.ingestion_failed');
  }

  async function execute(runtime, timelineEvent) {
    const sequence = runtime.scheduler.nextEventIndex;
    const truth = runtime.truth[timelineEvent.incident];
    const input = generateSourceEvent({
      runId: runtime.run.runId,
      scenario: runtime.run.scenarioType,
      sequence,
      timelineEvent,
      truth,
      resources: runtime.resources,
      hospitals: runtime.hospitals,
      random: new SeededRandom(runtime.run.seed * 1009 + sequence),
      now,
    });
    logger.info({ runId: runtime.run.runId, scenario: runtime.run.scenarioType, source: input.source, eventType: input.eventType, simulationTime: timelineEvent.at }, 'simulation.event.generated');
    logger.info({ runId: runtime.run.runId, eventId: input.eventId }, 'simulation.event.ingestion_attempted');
    try {
      const result = await ingestionService.ingest(input);
      logger.info({ runId: runtime.run.runId, eventId: result.event.eventId, duplicate: result.duplicate }, 'simulation.event.ingestion_succeeded');
      runtime.run = await repository.update(runtime.run.runId, {
        simulationTime: Math.floor(Math.max(runtime.clock.getElapsedTime(), timelineEvent.at)),
        eventsGenerated: runtime.run.eventsGenerated + (result.created ? 1 : 0),
        nextEventIndex: runtime.scheduler.nextEventIndex,
      });
      await publish('SIMULATION_EVENT', runtime.run, {
        eventId: result.event.eventId, source: input.source, eventType: input.eventType,
        simulationTime: timelineEvent.at,
      });
    } catch (error) {
      await fail(runtime, timelineEvent, error);
      throw error;
    }
  }

  async function completeIfDone(runtime) {
    if (runtime.scheduler.pendingCount > 0) return false;
    clearLoop(runtime);
    runtime.clock.stop();
    runtime.run = await repository.update(runtime.run.runId, {
      status: 'COMPLETED',
      simulationTime: runtime.scenario.defaultDuration,
      endedAt: now(),
    });
    await publish('SIMULATION_COMPLETED', runtime.run);
    logger.info({ runId: runtime.run.runId, eventsGenerated: runtime.run.eventsGenerated }, 'simulation.completed');
    return true;
  }

  async function tick(runtime) {
    if (runtime.processing || runtime.run.status !== 'RUNNING') return;
    runtime.processing = true;
    runtime.processingPromise = (async () => {
      const due = runtime.scheduler.takeDue(runtime.clock.getElapsedTime());
      for (const event of due) await execute(runtime, event);
      await completeIfDone(runtime);
    })();
    try {
      await runtime.processingPromise;
    } finally {
      runtime.processing = false;
      runtime.processingPromise = null;
    }
  }

  function startLoop(runtime) {
    if (runtime.timer) return;
    runtime.timer = setInterval(() => {
      tick(runtime).catch((error) => logger.error({ err: error, runId: runtime.run.runId }, 'simulation.tick_failed'));
    }, tickMilliseconds);
    runtime.timer.unref();
  }

  return {
    async create({ scenario, seed = 42, timeScale = 1 } = {}) {
      if (!Number.isSafeInteger(seed)) {
        throw new ValidationError('Invalid simulation seed', [{ path: 'seed', message: 'Expected a safe integer' }]);
      }
      if (!ALLOWED_TIME_SCALES.has(timeScale)) {
        throw new ValidationError('Invalid simulation timeScale', [{ path: 'timeScale', message: 'Allowed values are 1, 5, 10, and 20' }]);
      }
      const instantiated = instantiateScenario(scenario, seed);
      const [resourceRows, hospitalRows] = await Promise.all([resources.findAll(), hospitals.findAll()]);
      const runId = `SIM-${randomUUID().toUpperCase()}`;
      const run = await repository.create({
        runId,
        scenarioType: scenario,
        status: 'CREATED',
        seed,
        timeScale,
        configuration: { defaultDuration: instantiated.scenario.defaultDuration, failurePolicy: 'FAIL_FAST' },
        worldState: { ...createWorldState({ resources: resourceRows, hospitals: hospitalRows }), scenarioState: instantiated.initialState },
      }, instantiated.groundTruth);
      return run;
    },

    list() {
      return repository.findMany();
    },

    get(runId) {
      return requireRun(runId);
    },

    async start(runId) {
      const run = await requireRun(runId);
      if (run.status !== 'CREATED') throw stateError(`Cannot start simulation in ${run.status} state`);
      const runtime = await getRuntime(run);
      runtime.clock.start();
      runtime.run = await repository.update(runId, { status: 'RUNNING', startedAt: run.startedAt ?? now(), endedAt: null, failure: null });
      startLoop(runtime);
      await publish('SIMULATION_STARTED', runtime.run);
      logger.info({ runId, scenario: run.scenarioType, timeScale: run.timeScale }, 'simulation.started');
      return runtime.run;
    },

    async pause(runId) {
      const run = await requireRun(runId);
      if (run.status !== 'RUNNING') throw stateError(`Cannot pause simulation in ${run.status} state`);
      const runtime = await getRuntime(run);
      clearLoop(runtime);
      runtime.clock.pause();
      runtime.run = await repository.update(runId, { status: 'PAUSED', simulationTime: Math.floor(runtime.clock.getElapsedTime()) });
      await publish('SIMULATION_PAUSED', runtime.run);
      logger.info({ runId }, 'simulation.paused');
      return runtime.run;
    },

    async resume(runId) {
      const run = await requireRun(runId);
      if (run.status !== 'PAUSED') throw stateError(`Cannot resume simulation in ${run.status} state`);
      const runtime = await getRuntime(run);
      if (runtime.timer) throw stateError('Simulation already has an active scheduler');
      runtime.clock.resume();
      runtime.run = await repository.update(runId, { status: 'RUNNING' });
      startLoop(runtime);
      await publish('SIMULATION_RESUMED', runtime.run);
      logger.info({ runId }, 'simulation.resumed');
      return runtime.run;
    },

    async stop(runId) {
      const run = await requireRun(runId);
      if (TERMINAL_STATUSES.has(run.status)) throw stateError(`Cannot stop simulation in ${run.status} state`);
      const runtime = await getRuntime(run);
      clearLoop(runtime);
      runtime.scheduler.cancel();
      runtime.clock.stop();
      runtime.run = await repository.update(runId, { status: 'STOPPED', simulationTime: Math.floor(runtime.clock.getElapsedTime()), endedAt: now() });
      await publish('SIMULATION_STOPPED', runtime.run);
      logger.info({ runId }, 'simulation.stopped');
      return runtime.run;
    },

    async step(runId) {
      const run = await requireRun(runId);
      if (!['CREATED', 'PAUSED'].includes(run.status)) throw stateError(`Cannot step simulation in ${run.status} state`);
      const runtime = await getRuntime(run);
      const next = runtime.scheduler.takeNext();
      if (!next) {
        await completeIfDone(runtime);
        return runtime.run;
      }
      runtime.clock.step(Math.max(0, next.at - runtime.clock.getElapsedTime()));
      if (run.status === 'CREATED') {
        runtime.run = await repository.update(runId, { status: 'PAUSED', startedAt: now() });
        runtime.clock.status = 'PAUSED';
      }
      await execute(runtime, next);
      await completeIfDone(runtime);
      return runtime.run;
    },

    async reset(runId) {
      const run = await requireRun(runId);
      const runtime = runtimes.get(runId);
      if (runtime) {
        clearLoop(runtime);
        runtime.clock.stop();
        if (runtime.processingPromise) await runtime.processingPromise.catch(() => {});
        runtime.scheduler.cancel();
      }
      const result = await repository.resetOperationalData(runId);
      if (!result) throw new NotFoundError('Simulation run not found');
      if (result.blockedProcessing) {
        const stopped = TERMINAL_STATUSES.has(run.status) ? run : await repository.update(runId, {
          status: 'STOPPED', endedAt: now(), failure: null,
        });
        runtimes.delete(runId);
        await publish('SIMULATION_STOPPED', stopped, { resetPendingEvents: result.blockedProcessing });
        throw new ApplicationError('Demo stopped, but event intelligence is still processing. Retry reset in a moment.', {
          code: 'SIMULATION_RESET_PENDING', statusCode: 409, details: { pendingEvents: result.blockedProcessing },
        });
      }
      if (result.blockedMixedIncidents) {
        const stopped = TERMINAL_STATUSES.has(run.status) ? run : await repository.update(runId, {
          status: 'STOPPED', endedAt: now(), failure: null,
        });
        runtimes.delete(runId);
        await publish('SIMULATION_STOPPED', stopped, { mixedIncidents: result.blockedMixedIncidents });
        throw new ApplicationError('Demo stopped, but reset was not applied because demo evidence is linked to non-demo incident data.', {
          code: 'SIMULATION_RESET_MIXED_DATA', statusCode: 409, details: { mixedIncidents: result.blockedMixedIncidents },
        });
      }
      runtimes.delete(runId);
      await publish('SIMULATION_RESET', result.run, result.cleared);
      logger.info({ runId, ...result.cleared, preservedMixedIncidents: result.preservedMixedIncidents }, 'simulation.reset');
      return result;
    },

    shutdown() {
      for (const runtime of runtimes.values()) clearLoop(runtime);
    },
  };
}

export const simulatorService = createSimulatorService();
