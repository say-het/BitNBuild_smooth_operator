import { Router } from 'express';
import {
  cancelAssignment,
  getAssignment,
  reassignResource,
  updateAssignmentStatus,
} from '../controllers/assignments.controller.js';

export const assignmentsRouter = Router();

assignmentsRouter.get('/:assignmentId', getAssignment);
assignmentsRouter.patch('/:assignmentId/status', updateAssignmentStatus);
assignmentsRouter.post('/:assignmentId/cancel', cancelAssignment);
assignmentsRouter.post('/:assignmentId/reassign', reassignResource);
