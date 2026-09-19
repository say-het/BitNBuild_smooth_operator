import { Router } from 'express';
import { queryCopilot } from '../controllers/ai-operations.controller.js';

export const copilotRouter = Router();

copilotRouter.post('/query', queryCopilot);
