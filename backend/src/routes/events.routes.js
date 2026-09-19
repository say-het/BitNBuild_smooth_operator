import { Router } from 'express';
import { getEvent, getEventStatus, ingestEvent, listEvents, submitCitizenReport } from '../controllers/events.controller.js';
import { citizenImageUpload } from '../services/uploads/citizen-image-store.js';

export const eventsRouter = Router();

eventsRouter.post('/', ingestEvent);
eventsRouter.post('/citizen-report', citizenImageUpload, submitCitizenReport);
eventsRouter.get('/', listEvents);
eventsRouter.get('/:eventId/status', getEventStatus);
eventsRouter.get('/:eventId', getEvent);
