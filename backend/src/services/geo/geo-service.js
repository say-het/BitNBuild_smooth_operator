import { logger } from '../../config/logger.js';
import { geoRepository } from '../../repositories/geoRepository.js';

export const ACTIVE_INCIDENT_STATUSES = Object.freeze([
  'CREATED', 'ASSESSING', 'RESOURCE_RECOMMENDED', 'RESOURCE_ASSIGNED', 'EN_ROUTE',
  'ON_SCENE', 'RESOLVING', 'DELAYED', 'ESCALATED', 'REOPTIMIZED',
]);

export function calculateStraightLineDistance(origin, destination) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.lat - origin.lat);
  const longitudeDelta = radians(destination.lng - origin.lng);
  const left = Math.sin(latitudeDelta / 2) ** 2;
  const right = Math.cos(radians(origin.lat)) * Math.cos(radians(destination.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(left + right));
}

function presentPoint(row) {
  const { latitude, longitude, distanceMeters, ...data } = row;
  return {
    ...data,
    location: { lat: Number(latitude), lng: Number(longitude) },
    distanceMeters: Math.round(Number(distanceMeters)),
  };
}

export function createGeoService({ repository = geoRepository } = {}) {
  return {
    async findNearbyResources({
      lat,
      lng,
      radiusMeters = 25_000,
      resourceTypes = [],
      capabilities = [],
      status = 'AVAILABLE',
      capabilityMatch = 'ALL',
      excludeAssigned = false,
    }) {
      const rows = await repository.findNearbyResources({
        latitude: lat,
        longitude: lng,
        radiusMeters,
        resourceTypes,
        capabilities,
        status,
        capabilityMatch,
        excludeAssigned,
      });
      const results = rows.map(presentPoint);
      logger.info({ lat, lng, radiusMeters, count: results.length }, 'geo.nearby_resources');
      return results;
    },

    async findNearbyHospitals({ lat, lng, radiusMeters = 50_000, operationalOnly = true }) {
      const rows = await repository.findNearbyHospitals({
        latitude: lat, longitude: lng, radiusMeters, operationalOnly,
      });
      const results = rows.map(presentPoint);
      logger.info({ lat, lng, radiusMeters, operationalOnly, count: results.length }, 'geo.nearby_hospitals');
      return results;
    },

    async findNearbyIncidents({ lat, lng, radiusMeters = 25_000, statuses = ACTIVE_INCIDENT_STATUSES }) {
      const rows = await repository.findNearbyIncidents({
        latitude: lat, longitude: lng, radiusMeters, statuses,
      });
      const results = rows.map(presentPoint);
      logger.info({ lat, lng, radiusMeters, count: results.length }, 'geo.nearby_incidents');
      return results;
    },

    findCandidateResources({ incidentLocation, requiredCapabilities = [], radiusMeters = 25_000, resourceTypes = [] }) {
      return this.findNearbyResources({
        lat: incidentLocation.lat,
        lng: incidentLocation.lng,
        radiusMeters,
        resourceTypes,
        capabilities: requiredCapabilities,
        status: 'AVAILABLE',
        capabilityMatch: 'ANY',
        excludeAssigned: true,
      });
    },
  };
}

export const geoService = createGeoService();
