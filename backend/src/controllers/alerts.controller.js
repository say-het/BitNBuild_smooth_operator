import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { alertService } from '../services/monitoring/alert-service.js';

const listSchema = z.object({
  status: z.enum(['ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED']).optional(),
  type: z.enum(['CRITICAL_INCIDENT', 'RESPONSE_DELAY', 'RESOURCE_SHORTAGE', 'HOSPITAL_OVERLOAD', 'ESCALATION', 'SYSTEM']).optional(),
  incidentId: z.string().trim().min(1).max(128).optional(),
}).strict();

const lifecycleSchema = z.object({
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

export async function listAlerts(request, response) {
  const filters = parse(listSchema, request.query, 'Invalid alert filters');
  const data = await alertService.list(filters);
  response.status(200).json({ success: true, data, meta: { count: data.length } });
}

export async function getAlert(request, response) {
  response.status(200).json({ success: true, data: await alertService.get(request.params.alertId) });
}

export async function acknowledgeAlert(request, response) {
  const input = parse(lifecycleSchema, request.body ?? {}, 'Invalid alert acknowledgement');
  const data = await alertService.acknowledge(request.params.alertId, context(request, input.reason));
  response.status(200).json({ success: true, data });
}

export async function resolveAlert(request, response) {
  const input = parse(lifecycleSchema, request.body ?? {}, 'Invalid alert resolution');
  const data = await alertService.resolve(request.params.alertId, context(request, input.reason));
  response.status(200).json({ success: true, data });
}
