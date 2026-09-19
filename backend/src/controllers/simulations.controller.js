import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { simulatorService } from '../services/simulator/simulatorService.js';
import { simulationEvaluationService } from '../services/simulator/evaluation-service.js';

const createSchema = z.object({
  scenario: z.enum(['INDUSTRIAL_FIRE', 'FLOOD', 'ROAD_ACCIDENT', 'EARTHQUAKE']),
  seed: z.number().int().safe().optional().default(42),
  timeScale: z.union([z.literal(1), z.literal(5), z.literal(10), z.literal(20)]).optional().default(1),
}).strict();

function details(error) {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}

function present(run) {
  return {
    runId: run.runId,
    scenario: run.scenarioType,
    status: run.status,
    seed: run.seed,
    timeScale: run.timeScale,
    simulationTime: run.simulationTime,
    eventsGenerated: run.eventsGenerated,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    createdAt: run.createdAt,
    ...(run.failure ? { failure: run.failure } : {}),
  };
}

export async function createSimulation(request, response) {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) throw new ValidationError('Invalid simulation configuration', details(parsed.error));
  const run = await simulatorService.create(parsed.data);
  response.status(201).json({ success: true, data: present(run) });
}

export async function listSimulations(_request, response) {
  const runs = await simulatorService.list();
  response.status(200).json({ success: true, data: runs.map(present) });
}

export async function getSimulation(request, response) {
  const run = await simulatorService.get(request.params.runId);
  response.status(200).json({ success: true, data: present(run) });
}

export async function getSimulationEvaluation(request, response) {
  response.status(200).json({ success: true, data: await simulationEvaluationService.evaluate(request.params.runId) });
}

function control(action) {
  return async (request, response) => {
    const run = await simulatorService[action](request.params.runId);
    response.status(200).json({ success: true, data: present(run) });
  };
}

export const startSimulation = control('start');
export const pauseSimulation = control('pause');
export const resumeSimulation = control('resume');
export const stopSimulation = control('stop');
export const stepSimulation = control('step');

export async function resetSimulation(request, response) {
  const result = await simulatorService.reset(request.params.runId);
  response.status(200).json({
    success: true,
    data: { ...present(result.run), reset: result.cleared, preservedMixedIncidents: result.preservedMixedIncidents },
  });
}
