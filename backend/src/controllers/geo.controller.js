import { z } from 'zod';
import { ValidationError } from '../errors/application-error.js';
import { geoService } from '../services/geo/geo-service.js';
import { routingService } from '../services/routing/routing-service.js';
import { roadStatusService } from '../services/geo/road-status-service.js';
import { liveContextService } from '../services/geo/live-context-service.js';

const coordinateQuery = {
  lat: z.coerce.number().finite().min(-90).max(90),
  lng: z.coerce.number().finite().min(-180).max(180),
  radius: z.coerce.number().int().positive().max(200_000).optional(),
};

const commaList = (values) => z.preprocess(
  (value) => typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
  z.array(z.enum(values)).optional().default([]),
);

const resourcesQuerySchema = z.object({
  ...coordinateQuery,
  resourceTypes: commaList(['AMBULANCE', 'FIRE_TRUCK', 'POLICE_UNIT', 'RESCUE_TEAM', 'MEDICAL_TEAM', 'HAZMAT_TEAM', 'HELICOPTER', 'EQUIPMENT', 'OTHER']),
  capabilities: z.preprocess(
    (value) => typeof value === 'string' ? value.split(',').map((item) => item.trim()).filter(Boolean) : value,
    z.array(z.string().trim().min(1).max(64)).max(20).optional().default([]),
  ),
  status: z.enum(['AVAILABLE', 'RESERVED', 'ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'UNAVAILABLE', 'MAINTENANCE', 'OFFLINE']).optional().default('AVAILABLE'),
}).strict();

const hospitalsQuerySchema = z.object({
  ...coordinateQuery,
  operationalOnly: z.enum(['true', 'false']).optional().default('true').transform((value) => value === 'true'),
}).strict();

const incidentsQuerySchema = z.object({
  ...coordinateQuery,
  statuses: commaList(['CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE', 'ON_SCENE', 'RESOLVING', 'RESOLVED', 'DELAYED', 'ESCALATED', 'REOPTIMIZED', 'CANCELLED']),
}).strict();

const pointSchema = z.object({
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
}).strict();

const routeSchema = z.object({
  origin: pointSchema,
  destination: pointSchema,
  resourceType: z.enum(['AMBULANCE', 'FIRE_TRUCK', 'POLICE_UNIT', 'RESCUE_TEAM', 'MEDICAL_TEAM', 'HAZMAT_TEAM', 'HELICOPTER', 'EQUIPMENT', 'OTHER']).optional(),
}).strict();

const liveContextSchema = z.object({
  ...coordinateQuery,
  radius: z.coerce.number().int().positive().max(25_000).optional().default(12_000),
}).strict();

function parse(schema, input, message) {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError(message, result.error.issues.map((issue) => ({
    path: issue.path.join('.'), message: issue.message,
  })));
}

export async function findNearbyResources(request, response) {
  const query = parse(resourcesQuerySchema, request.query, 'Invalid nearby resource query');
  const data = await geoService.findNearbyResources({
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radius,
    resourceTypes: query.resourceTypes,
    capabilities: query.capabilities,
    status: query.status,
  });
  response.status(200).json({ success: true, data, meta: { count: data.length } });
}

export async function findNearbyHospitals(request, response) {
  const query = parse(hospitalsQuerySchema, request.query, 'Invalid nearby hospital query');
  const data = await geoService.findNearbyHospitals({
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radius,
    operationalOnly: query.operationalOnly,
  });
  response.status(200).json({ success: true, data, meta: { count: data.length } });
}

export async function findNearbyIncidents(request, response) {
  const query = parse(incidentsQuerySchema, request.query, 'Invalid nearby incident query');
  const data = await geoService.findNearbyIncidents({
    lat: query.lat,
    lng: query.lng,
    radiusMeters: query.radius,
    ...(query.statuses.length ? { statuses: query.statuses } : {}),
  });
  response.status(200).json({ success: true, data, meta: { count: data.length } });
}

export async function getRoute(request, response) {
  const input = parse(routeSchema, request.body, 'Invalid route request');
  const data = await routingService.getRoute(input);
  response.status(200).json({ success: true, data });
}

export async function getRoads(_request, response) {
  response.status(200).json({ success: true, data: await roadStatusService.getSnapshot() });
}

export async function getLiveContext(request, response) {
  const query = parse(liveContextSchema, request.query, 'Invalid live context query');
  response.status(200).json({ success: true, data: await liveContextService.get(query) });
}
