import { Router } from 'express';
import { getAnalyticsOverview } from '../controllers/analytics.controller.js';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', getAnalyticsOverview);
