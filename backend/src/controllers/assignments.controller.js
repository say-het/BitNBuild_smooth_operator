import { z } from 'zod';
import { NotFoundError, ValidationError } from '../errors/application-error.js';
import { assignmentRepository } from '../repositories/assignmentRepository.js';
import { presentAssignment } from '../services/orchestration/assignment-contract.js';
import { responseOrchestrator } from '../services/orchestration/response-orchestrator.js';

const statusSchema = z.object({
  status: z.enum(['ACCEPTED', 'EN_ROUTE', 'ON_SCENE', 'COMPLETED', 'CANCELLED']),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

const reassignSchema = z.object({
  resourceId: z.string().trim().min(1).max(128),
  role: z.string().trim().min(1).max(128).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  origin: z.enum(['MANUAL', 'OPTIMIZER', 'ESCALATION', 'SYSTEM']).optional().default('ESCALATION'),
  optimizationScore: z.number().finite().min(0).max(1).optional(),
}).strict();

const cancelSchema = z.object({
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

function parse(schema, value, message) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError(message, parsed.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })));
}

function context(request, reason) {
  return {
    actorType: 'OPERATOR',
    actorId: request.headers['x-actor-id'] ?? null,
    correlationId: request.id,
    reason,
  };
}

export async function getAssignment(request, response) {
  const assignment = await assignmentRepository.findByAssignmentId(request.params.assignmentId);
  if (!assignment) throw new NotFoundError('Assignment not found');
  response.status(200).json({ success: true, data: presentAssignment(assignment) });
}

export async function updateAssignmentStatus(request, response) {
  const input = parse(statusSchema, request.body, 'Invalid assignment status request');
  const data = await responseOrchestrator.transitionAssignment(
    request.params.assignmentId,
    input.status,
    context(request, input.reason),
  );
  response.status(200).json({ success: true, data });
}

export async function cancelAssignment(request, response) {
  const input = parse(cancelSchema, request.body ?? {}, 'Invalid assignment cancellation request');
  const data = await responseOrchestrator.cancelAssignment(
    request.params.assignmentId,
    context(request, input.reason),
  );
  response.status(200).json({ success: true, data });
}

export async function reassignResource(request, response) {
  const input = parse(reassignSchema, request.body, 'Invalid reassignment request');
  const data = await responseOrchestrator.reassignResource(
    request.params.assignmentId,
    input,
    context(request, input.reason),
  );
  response.status(201).json({ success: true, data });
}
