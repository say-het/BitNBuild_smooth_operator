import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { assignmentRepository } from '../repositories/assignmentRepository.js';
import { presentAssignment } from '../services/orchestration/assignment-contract.js';
import { responseOrchestrator } from '../services/orchestration/response-orchestrator.js';

const assignmentInputSchema = z.object({
  resourceId: z.string().trim().min(1).max(128),
  role: z.string().trim().min(1).max(128).optional(),
  reason: z.string().trim().min(1).max(500).optional(),
  origin: z.enum(['MANUAL', 'OPTIMIZER', 'ESCALATION', 'SYSTEM']).optional().default('MANUAL'),
  optimizationScore: z.number().finite().min(0).max(1).optional(),
}).strict();

const bulkSchema = z.object({
  assignments: z.array(assignmentInputSchema).min(1).max(25),
}).strict();

const resolutionSchema = z.object({
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
    actorType: 'OPERATOR', actorId: request.headers['x-actor-id'] ?? null,
    correlationId: request.id, reason,
  };
}

export async function createAssignment(request, response) {
  const input = parse(assignmentInputSchema, request.body, 'Invalid assignment request');
  const data = await responseOrchestrator.assignResource(
    request.params.incidentId,
    input,
    context(request, input.reason),
  );
  response.status(201).json({ success: true, data });
}

export async function createAssignmentsBulk(request, response) {
  const input = parse(bulkSchema, request.body, 'Invalid bulk assignment request');
  const data = await responseOrchestrator.assignResources(
    request.params.incidentId,
    input.assignments,
    context(request, 'Bulk resource assignment'),
  );
  response.status(201).json({ success: true, data });
}

export async function listIncidentAssignments(request, response) {
  const assignments = await assignmentRepository.findIncidentAssignments(request.params.incidentId);
  response.status(200).json({ success: true, data: assignments.map(presentAssignment), meta: { count: assignments.length } });
}

export async function listResourceAssignments(request, response) {
  const assignments = await assignmentRepository.findResourceAssignments(request.params.resourceId);
  response.status(200).json({ success: true, data: assignments.map(presentAssignment), meta: { count: assignments.length } });
}

export async function resolveIncident(request, response) {
  const input = parse(resolutionSchema, request.body ?? {}, 'Invalid incident resolution request');
  const data = await responseOrchestrator.resolveIncident(
    request.params.incidentId,
    context(request, input.reason ?? 'Incident explicitly resolved'),
  );
  response.status(200).json({ success: true, data });
}

export async function cancelIncident(request, response) {
  const input = parse(resolutionSchema, request.body ?? {}, 'Invalid incident cancellation request');
  const data = await responseOrchestrator.cancelIncident(
    request.params.incidentId,
    context(request, input.reason ?? 'Incident cancelled by operator'),
  );
  response.status(200).json({ success: true, data });
}
