import { Router } from 'express';
import {
  acknowledgeAlert,
  getAlert,
  listAlerts,
  resolveAlert,
} from '../controllers/alerts.controller.js';

export const alertsRouter = Router();

alertsRouter.get('/', listAlerts);
alertsRouter.get('/:alertId', getAlert);
alertsRouter.patch('/:alertId/acknowledge', acknowledgeAlert);
alertsRouter.patch('/:alertId/resolve', resolveAlert);
