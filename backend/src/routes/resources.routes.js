import { Router } from 'express';
import { listResources } from '../controllers/resources.controller.js';
import { listResourceAssignments } from '../controllers/orchestration.controller.js';
import { updateResourceLocation } from '../controllers/resource-location.controller.js';

export const resourcesRouter = Router();

resourcesRouter.get('/', listResources);
resourcesRouter.get('/:resourceId/assignments', listResourceAssignments);
resourcesRouter.patch('/:resourceId/location', updateResourceLocation);
