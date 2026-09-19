import { Router } from 'express';
import {
  createSimulation,
  getSimulation,
  getSimulationEvaluation,
  listSimulations,
  pauseSimulation,
  resetSimulation,
  resumeSimulation,
  startSimulation,
  stepSimulation,
  stopSimulation,
} from '../controllers/simulations.controller.js';

export const simulationsRouter = Router();

simulationsRouter.post('/', createSimulation);
simulationsRouter.get('/', listSimulations);
simulationsRouter.get('/:runId/evaluation', getSimulationEvaluation);
simulationsRouter.get('/:runId', getSimulation);
simulationsRouter.post('/:runId/start', startSimulation);
simulationsRouter.post('/:runId/pause', pauseSimulation);
simulationsRouter.post('/:runId/resume', resumeSimulation);
simulationsRouter.post('/:runId/stop', stopSimulation);
simulationsRouter.post('/:runId/step', stepSimulation);
simulationsRouter.post('/:runId/reset', resetSimulation);
