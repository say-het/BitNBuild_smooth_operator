import { Router } from 'express';
import { recommendResources } from '../controllers/optimization.controller.js';

export const optimizationRouter = Router();

optimizationRouter.post('/recommend', recommendResources);
