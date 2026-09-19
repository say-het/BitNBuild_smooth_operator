import { Router } from 'express';
import { getRealtimeStatus } from '../controllers/realtime.controller.js';

export const realtimeRouter = Router();

realtimeRouter.get('/status', getRealtimeStatus);
