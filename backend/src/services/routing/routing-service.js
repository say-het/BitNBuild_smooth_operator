import { createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ValidationError } from '../../errors/application-error.js';
import { calculateStraightLineDistance } from '../geo/geo-service.js';
import { roadStatusService } from '../geo/road-status-service.js';

const TYPE_SPEED_KPH = Object.freeze({
  AMBULANCE: 40,
  FIRE_TRUCK: 35,
  POLICE_UNIT: 45,
  RESCUE_TEAM: 30,
  MEDICAL_TEAM: 35,
  HAZMAT_TEAM: 30,
  HELICOPTER: 140,
  EQUIPMENT: 25,
});

function validatePoint(point, path) {
  const valid = point && Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
  if (!valid) {
    throw new ValidationError(`Invalid ${path}`, [
      { path, message: 'Expected finite WGS84 lat/lng coordinates' },
    ]);
  }
  return { lat: point.lat, lng: point.lng };
}

function routeId(origin, destination, provider, roadStateVersion) {
  const value = JSON.stringify([origin, destination, provider, roadStateVersion]);
  return `RTE-${createHash('sha256').update(value).digest('hex').slice(0, 16).toUpperCase()}`;
}

function cacheKey(origin, destination, profile, roadStateVersion, resourceType) {
  const rounded = (point) => [point.lat.toFixed(5), point.lng.toFixed(5)];
  return JSON.stringify([rounded(origin), rounded(destination), profile, roadStateVersion, resourceType ?? null]);
}

function routeResult({ origin, destination, distanceMeters, durationSeconds, geometry, provider, estimated, roadStateVersion, roadStatus }) {
  const distance = Math.round(distanceMeters);
  const duration = Math.max(1, Math.round(durationSeconds));
  return {
    routeId: routeId(origin, destination, provider, roadStateVersion),
    origin,
    destination,
    distanceMeters: distance,
    durationSeconds: duration,
    etaMinutes: Math.max(1, Math.ceil(duration / 60)),
    geometry,
    provider,
    estimated,
    estimateBasis: ['OSRM', 'OPENROUTESERVICE'].includes(provider)
      ? `road-network travel-time estimate from ${provider === 'OPENROUTESERVICE' ? 'OpenRouteService' : 'OSRM'}; not live traffic`
      : 'straight-line geodesic distance and assumed travel speed; not a navigable route',
    roadStatus,
  };
}

function osrmCoordinates(points) {
  return points.map(({ lat, lng }) => `${lng},${lat}`).join(';');
}

export function createRoutingService({
  baseUrl = env.OSRM_BASE_URL,
  timeoutMs = env.ROUTING_TIMEOUT_MS,
  cacheTtlSeconds = env.ROUTE_CACHE_TTL_SECONDS,
  fallbackSpeedKph = env.ROUTING_FALLBACK_SPEED_KPH,
  orsApiKey = env.OPENROUTESERVICE_API_KEY,
  orsBaseUrl = env.OPENROUTESERVICE_BASE_URL,
  fetchImpl = globalThis.fetch,
  roads = roadStatusService,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');

  async function requestJson(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`Routing provider returned HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestOrs(path, body) {
    if (!orsApiKey) return null;
    return requestJson(`${orsBaseUrl.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { authorization: orsApiKey, 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  }

  function fromOrs(origin, destination, body, snapshot) {
    const feature = body?.features?.[0];
    const summary = feature?.properties?.summary;
    if (!feature?.geometry?.coordinates || !Number.isFinite(summary?.distance) || !Number.isFinite(summary?.duration)) throw new Error('OpenRouteService returned no valid route');
    return routeResult({ origin, destination, distanceMeters: summary.distance, durationSeconds: summary.duration, geometry: feature.geometry, provider: 'OPENROUTESERVICE', estimated: false, roadStateVersion: snapshot.version, roadStatus: roads.assessRoute(feature.geometry, snapshot) });
  }

  function fallback(origin, destination, resourceType, snapshot) {
    const distanceMeters = calculateStraightLineDistance(origin, destination);
    const speedKph = TYPE_SPEED_KPH[resourceType] ?? fallbackSpeedKph;
    const durationSeconds = distanceMeters / (speedKph * 1_000 / 3_600);
    const geometry = { type: 'LineString', coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] };
    return routeResult({
      origin,
      destination,
      distanceMeters,
      durationSeconds,
      geometry,
      provider: 'FALLBACK',
      estimated: true,
      roadStateVersion: snapshot.version,
      roadStatus: { status: 'UNKNOWN', potentiallyImpacted: false, impactedRoads: [] },
    });
  }

  async function getRoute({ origin: rawOrigin, destination: rawDestination, profile = 'driving', resourceType } = {}) {
    const origin = validatePoint(rawOrigin, 'origin');
    const destination = validatePoint(rawDestination, 'destination');
    const snapshot = await roads.getSnapshot();
    const key = cacheKey(origin, destination, profile, snapshot.version, resourceType);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.value;

    logger.info({ origin, destination, profile }, 'routing.request');
    try {
      if (orsApiKey) {
        const value = fromOrs(origin, destination, await requestOrs('/v2/directions/driving-car/geojson', { coordinates: [[origin.lng, origin.lat], [destination.lng, destination.lat]] }), snapshot);
        cache.set(key, { value, expiresAt: now() + cacheTtlSeconds * 1_000 });
        return value;
      }
      const url = `${normalizedBaseUrl}/route/v1/${encodeURIComponent(profile)}/${osrmCoordinates([origin, destination])}?overview=full&geometries=geojson&steps=false`;
      const body = await requestJson(url);
      const route = body?.code === 'Ok' ? body.routes?.[0] : null;
      if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)
        || route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)) {
        throw new Error('OSRM returned no valid route');
      }
      const value = routeResult({
        origin,
        destination,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        geometry: route.geometry,
        provider: 'OSRM',
        estimated: false,
        roadStateVersion: snapshot.version,
        roadStatus: roads.assessRoute(route.geometry, snapshot),
      });
      cache.set(key, { value, expiresAt: now() + cacheTtlSeconds * 1_000 });
      logger.info({ routeId: value.routeId, distanceMeters: value.distanceMeters, durationSeconds: value.durationSeconds, provider: value.provider }, 'routing.completed');
      return value;
    } catch (error) {
      logger.warn({ err: error, origin, destination }, 'routing.primary_failed');
      try {
        const url = `${normalizedBaseUrl}/route/v1/${encodeURIComponent(profile)}/${osrmCoordinates([origin, destination])}?overview=full&geometries=geojson&steps=false`;
        const body = await requestJson(url);
        const route = body?.code === 'Ok' ? body.routes?.[0] : null;
        if (!route?.geometry?.coordinates || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) throw new Error('OSRM returned no valid route');
        const value = routeResult({ origin, destination, distanceMeters: route.distance, durationSeconds: route.duration, geometry: route.geometry, provider: 'OSRM', estimated: false, roadStateVersion: snapshot.version, roadStatus: roads.assessRoute(route.geometry, snapshot) });
        cache.set(key, { value, expiresAt: now() + cacheTtlSeconds * 1_000 });
        return value;
      } catch (fallbackError) {
        logger.warn({ err: fallbackError, origin, destination }, 'routing.osrm_failed');
      const value = fallback(origin, destination, resourceType, snapshot);
      cache.set(key, { value, expiresAt: now() + cacheTtlSeconds * 1_000 });
      logger.warn({ routeId: value.routeId, distanceMeters: value.distanceMeters, durationSeconds: value.durationSeconds }, 'routing.fallback');
      return value;
      }
    }
  }

  async function rankByTravelTime({ resources, destination: rawDestination, profile = 'driving' }) {
    const destination = validatePoint(rawDestination, 'destination');
    const candidates = resources
      .map((resource) => ({
        resource,
        origin: validatePoint(resource.location ?? {
          lat: Number(resource.latitude), lng: Number(resource.longitude),
        }, `resources.${resource.resourceId ?? 'unknown'}.location`),
      }))
      .slice(0, 99);
    if (candidates.length === 0) return [];

    const snapshot = await roads.getSnapshot();
    try {
      const points = [...candidates.map(({ origin }) => origin), destination];
      if (orsApiKey) {
        const body = await requestOrs('/v2/matrix/driving-car', {
          locations: points.map(({ lng, lat }) => [lng, lat]), sources: candidates.map((_, index) => String(index)), destinations: [String(candidates.length)], metrics: ['distance', 'duration'], units: 'm',
        });
        if (!Array.isArray(body?.durations) || !Array.isArray(body?.distances)) throw new Error('OpenRouteService returned no valid route matrix');
        return candidates.map(({ resource, origin }, index) => ({ resource, route: routeResult({ origin, destination, distanceMeters: body.distances[index]?.[0], durationSeconds: body.durations[index]?.[0], geometry: null, provider: 'OPENROUTESERVICE', estimated: false, roadStateVersion: snapshot.version, roadStatus: { status: 'UNKNOWN', potentiallyImpacted: false, impactedRoads: [] } }) })).sort((left, right) => left.route.durationSeconds - right.route.durationSeconds);
      }
      const sourceIndexes = candidates.map((_, index) => index).join(';');
      const destinationIndex = candidates.length;
      const url = `${normalizedBaseUrl}/table/v1/${encodeURIComponent(profile)}/${osrmCoordinates(points)}?sources=${sourceIndexes}&destinations=${destinationIndex}&annotations=duration,distance`;
      const body = await requestJson(url);
      if (body?.code !== 'Ok' || !Array.isArray(body.durations) || !Array.isArray(body.distances)) {
        throw new Error('OSRM returned no valid route matrix');
      }
      if (candidates.some((_, index) => !Number.isFinite(body.durations[index]?.[0])
        || !Number.isFinite(body.distances[index]?.[0]))) {
        throw new Error('OSRM route matrix contains unreachable candidates');
      }
      return candidates.map(({ resource, origin }, index) => ({
        resource,
        route: routeResult({
          origin,
          destination,
          distanceMeters: body.distances[index]?.[0],
          durationSeconds: body.durations[index]?.[0],
          geometry: null,
          provider: 'OSRM',
          estimated: false,
          roadStateVersion: snapshot.version,
          roadStatus: { status: 'UNKNOWN', potentiallyImpacted: false, impactedRoads: [] },
        }),
      }))
        .sort((left, right) => left.route.durationSeconds - right.route.durationSeconds);
    } catch (error) {
      logger.warn({ err: error, resourceCount: candidates.length }, 'routing.failed');
      const ranked = await Promise.all(candidates.map(async ({ resource, origin }) => ({
        resource,
        route: await getRoute({ origin, destination, profile, resourceType: resource.type }),
      })));
      return ranked.sort((left, right) => left.route.durationSeconds - right.route.durationSeconds);
    }
  }

  return { getRoute, getRoutesToIncident: rankByTravelTime, rankByTravelTime };
}

export const routingService = createRoutingService();
