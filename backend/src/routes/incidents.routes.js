import { Router } from 'express';
import { getIncident, getIncidentEvents, listIncidents, transitionIncident } from '../controllers/incidents.controller.js';
import { analyzeSituation, getSituationAnalysis } from '../controllers/ai-operations.controller.js';
import {
  createAssignment,
  createAssignmentsBulk,
  cancelIncident,
  listIncidentAssignments,
  resolveIncident,
} from '../controllers/orchestration.controller.js';

export const incidentsRouter = Router();

incidentsRouter.get('/', listIncidents);
incidentsRouter.get('/:incidentId/events', getIncidentEvents);
incidentsRouter.get('/:incidentId/analysis', getSituationAnalysis);
incidentsRouter.post('/:incidentId/analysis', analyzeSituation);
incidentsRouter.get('/:incidentId/assignments', listIncidentAssignments);
incidentsRouter.post('/:incidentId/assignments/bulk', createAssignmentsBulk);
incidentsRouter.post('/:incidentId/assignments', createAssignment);
incidentsRouter.post('/:incidentId/resolve', resolveIncident);
incidentsRouter.post('/:incidentId/cancel', cancelIncident);
incidentsRouter.post('/:incidentId/transition', transitionIncident);
incidentsRouter.get('/:incidentId', getIncident);
