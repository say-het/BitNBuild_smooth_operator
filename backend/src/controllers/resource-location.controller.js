import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { resourceLocationService } from '../services/resources/resource-location-service.js';

const locationSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

export async function updateResourceLocation(request, response) {
  const parsed = locationSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ValidationError('Invalid resource location', parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'), message: issue.message,
    })));
  }
  const resource = await resourceLocationService.update(request.params.resourceId, parsed.data, {
    actorType: 'OPERATOR', actorId: request.headers['x-actor-id'] ?? null, correlationId: request.id,
  });
  response.status(200).json({
    success: true,
    data: { resourceId: resource.resourceId, location: { lat: Number(resource.latitude), lng: Number(resource.longitude) } },
  });
}
