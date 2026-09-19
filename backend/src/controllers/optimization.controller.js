import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { resourceIntelligenceService } from '../services/resources/resource-intelligence-service.js';

const recommendationSchema = z.object({
  incidentIds: z.array(z.string().trim().min(1).max(128)).min(1).max(20)
    .transform((values) => [...new Set(values)]),
}).strict();

export async function recommendResources(request, response) {
  const parsed = recommendationSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid optimization request', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'), message: issue.message,
    })));
  }
  const data = await resourceIntelligenceService.recommend(parsed.data.incidentIds);
  response.status(200).json({ success: true, data });
}
