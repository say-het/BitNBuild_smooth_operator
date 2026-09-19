import { Router } from 'express';
import { getMonitoringStatus, runMonitoring } from '../controllers/monitoring.controller.js';

export const monitoringRouter = Router();

monitoringRouter.post('/run', runMonitoring);
monitoringRouter.get('/status', getMonitoringStatus);
