import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { copilotService } from '../services/ai/copilot-service.js';
import { situationAnalysisService } from '../services/ai/situation-analysis-service.js';

const analysisSchema = z.object({ force: z.boolean().optional().default(false) }).strict();
const copilotSchema = z.object({
  message: z.string().trim().min(2).max(500),
  sessionId: z.string().uuid().optional(),
}).strict();

function parse(schema, value, message) {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError(message, parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })));
}

export async function getSituationAnalysis(request, response) {
  response.status(200).json({ success: true, data: await situationAnalysisService.get(request.params.incidentId) });
}

export async function analyzeSituation(request, response) {
  const input = parse(analysisSchema, request.body ?? {}, 'Invalid situation analysis request');
  response.status(200).json({ success: true, data: await situationAnalysisService.analyze(request.params.incidentId, input) });
}

export async function queryCopilot(request, response) {
  const input = parse(copilotSchema, request.body, 'Invalid Copilot query');
  response.status(200).json({ success: true, data: await copilotService.query(input) });
}
