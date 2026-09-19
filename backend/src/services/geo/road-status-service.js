import { createHash } from 'node:crypto';
import { roadStatusRepository } from '../../repositories/roadStatusRepository.js';
import { SYNTHETIC_WORLD } from '../simulator/worldState.js';

const IMPACTING_STATUSES = new Set(['BLOCKED', 'CLOSED']);
const ROAD_STATUSES = new Set(['OPEN', 'CONGESTED', 'BLOCKED', 'CLOSED']);

function latestByRoad(updates) {
  const latest = new Map();
  for (const event of updates) {
    const roadId = event.payload?.roadId;
    if (roadId && !latest.has(roadId)) latest.set(roadId, event);
  }
  return latest;
}

function orientation(a, b, c) {
  return Math.sign((b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]));
}

function intersects(a, b, c, d) {
  return orientation(a, b, c) !== orientation(a, b, d)
    && orientation(c, d, a) !== orientation(c, d, b);
}

function routeIntersectsRoad(routeCoordinates, roadCoordinates) {
  for (let routeIndex = 1; routeIndex < routeCoordinates.length; routeIndex += 1) {
    for (let roadIndex = 1; roadIndex < roadCoordinates.length; roadIndex += 1) {
      if (intersects(
        routeCoordinates[routeIndex - 1], routeCoordinates[routeIndex],
        roadCoordinates[roadIndex - 1], roadCoordinates[roadIndex],
      )) return true;
    }
  }
  return false;
}

export function createRoadStatusService({ repository = roadStatusRepository, roads = SYNTHETIC_WORLD.roads } = {}) {
  return {
    async getSnapshot() {
      const latest = latestByRoad(await repository.findLatestUpdates());
      const current = roads.map((road) => ({
        ...road,
        status: ROAD_STATUSES.has(latest.get(road.roadId)?.payload?.status)
          ? latest.get(road.roadId).payload.status
          : road.status,
        updatedAt: latest.get(road.roadId)?.timestamp ?? null,
      }));
      const state = current.map(({ roadId, status, updatedAt }) => [roadId, status, updatedAt?.toISOString?.() ?? null]);
      return {
        roads: current,
        version: createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 12),
      };
    },

    assessRoute(geometry, snapshot) {
      const routeCoordinates = geometry?.coordinates;
      if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) {
        return { status: 'UNKNOWN', potentiallyImpacted: false, impactedRoads: [] };
      }
      const impactedRoads = snapshot.roads
        .filter((road) => IMPACTING_STATUSES.has(road.status))
        .filter((road) => routeIntersectsRoad(routeCoordinates, road.geometry))
        .map(({ roadId, name, status }) => ({ roadId, name, status }));
      return {
        status: impactedRoads.length ? 'POTENTIALLY_IMPACTED' : 'CLEAR',
        potentiallyImpacted: impactedRoads.length > 0,
        impactedRoads,
      };
    },
  };
}

export const roadStatusService = createRoadStatusService();
