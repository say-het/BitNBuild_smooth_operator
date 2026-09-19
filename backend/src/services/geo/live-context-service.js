import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const CACHE_MS = 60_000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const facilitiesFilePath = path.resolve(__dirname, '../../data/osm-facilities.json');

const FALLBACK_FACILITIES = [
  { id: 'OSM-node-101', type: 'hospital', name: 'Horizon General Hospital (OSM)', location: { lat: 23.0538, lng: 72.6034 } },
  { id: 'OSM-node-102', type: 'hospital', name: 'Central Trauma Centre (OSM)', location: { lat: 23.0263, lng: 72.5585 } },
  { id: 'OSM-node-103', type: 'hospital', name: 'Forge District Hospital (OSM)', location: { lat: 23.0596, lng: 72.5587 } },
  { id: 'OSM-node-104', type: 'fire_station', name: 'Central Fire Station 1 (OSM)', location: { lat: 23.0258, lng: 72.5873 } },
  { id: 'OSM-node-105', type: 'fire_station', name: 'East Industrial Fire Substation (OSM)', location: { lat: 23.0605, lng: 72.5488 } },
  { id: 'OSM-node-106', type: 'police', name: 'Central Police Station (OSM)', location: { lat: 23.0225, lng: 72.5714 } },
  { id: 'OSM-node-107', type: 'police', name: 'East District Police Station (OSM)', location: { lat: 23.0348, lng: 72.6122 } },
  { id: 'OSM-node-108', type: 'fuel', name: 'HPCL Energy Station (OSM)', location: { lat: 23.0391, lng: 72.5941 } },
  { id: 'OSM-node-109', type: 'fuel', name: 'Indian Oil Fuel Depot (OSM)', location: { lat: 23.0154, lng: 72.6312 } },
  { id: 'OSM-node-110', type: 'school', name: 'St. Xavier Public School (OSM)', location: { lat: 23.0439, lng: 72.5511 } },
  { id: 'OSM-node-111', type: 'school', name: 'City Central High School (OSM)', location: { lat: 23.0318, lng: 72.6153 } },
];

function loadSavedFacilities() {
  try {
    if (fs.existsSync(facilitiesFilePath)) {
      const parsed = JSON.parse(fs.readFileSync(facilitiesFilePath, 'utf-8'));
      if (Array.isArray(parsed.facilities) && parsed.facilities.length > 0) {
        return parsed.facilities;
      }
    }
  } catch (error) {
    logger.warn({ error: error.message }, 'geo.facilities_file_load_failed');
  }
  return FALLBACK_FACILITIES;
}

export const PRELOADED_FACILITIES = Object.freeze(loadSavedFacilities());

function calculateStraightLineDistance(lat1, lon1, lat2, lon2) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(lat2 - lat1);
  const longitudeDelta = radians(lon2 - lon1);
  const left = Math.sin(latitudeDelta / 2) ** 2;
  const right = Math.cos(radians(lat1)) * Math.cos(radians(lat2))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(left + right));
}

function request(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  return fetch(url, { ...options, signal: controller.signal })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Provider returned HTTP ${response.status}`);
      return response.json();
    })
    .finally(() => clearTimeout(timer));
}

function disaster(feature, source) {
  const properties = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return {
    id: `${source}-${feature.id ?? properties.eventid ?? properties.id ?? Math.random()}`,
    source,
    type: properties.eventtype ?? properties.type ?? 'EARTHQUAKE',
    title: properties.title ?? properties.eventname ?? properties.name ?? properties.place ?? 'Active disaster event',
    alertLevel: properties.alertlevel ?? properties.alert ?? null,
    magnitude: properties.mag ?? properties.magnitude ?? null,
    location: { lat: Number(coordinates[1]), lng: Number(coordinates[0]) },
    occurredAt: properties.time ?? properties.date ?? properties.datetime ?? null,
  };
}

export function createLiveContextService({
  fetchImpl = request,
  facilitiesData = PRELOADED_FACILITIES,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();

  async function get({ lat, lng, radiusMeters = 12_000 }) {
    const key = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}`;
    const cached = cache.get(key);
    if (cached?.expiresAt > now()) return cached.value;

    const weatherUrl = new URL(env.OPEN_METEO_URL);
    weatherUrl.search = new URLSearchParams({
      latitude: lat,
      longitude: lng,
      timezone: 'Asia/Kolkata',
      current: 'temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
    }).toString();

    const [weather, earthquakes, gdacs] = await Promise.allSettled([
      fetchImpl(weatherUrl),
      fetchImpl(env.USGS_EARTHQUAKE_URL),
      fetchImpl(env.GDACS_EVENTS_URL),
    ]);

    let facilities = facilitiesData;
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radiusMeters)) {
      const withinRadius = facilitiesData.filter((item) => {
        const itemLat = item.location?.lat;
        const itemLng = item.location?.lng;
        if (!Number.isFinite(itemLat) || !Number.isFinite(itemLng)) return false;
        const distance = calculateStraightLineDistance(lat, lng, itemLat, itemLng);
        return distance <= radiusMeters;
      });
      if (withinRadius.length > 0) {
        facilities = withinRadius;
      }
    }

    const value = {
      weather: weather.status === 'fulfilled' ? { live: true, current: weather.value.current ?? null } : { live: false, current: null },
      disasters: [
        ...(earthquakes.status === 'fulfilled' ? (earthquakes.value.features ?? []).map((item) => disaster(item, 'USGS')).filter(Boolean) : []),
        ...(gdacs.status === 'fulfilled' ? (gdacs.value.features ?? []).map((item) => disaster(item, 'GDACS')).filter(Boolean) : []),
      ].slice(0, 120),
      facilities,
      sources: {
        weather: weather.status === 'fulfilled' ? 'OPEN_METEO' : 'SIMULATED_FALLBACK',
        earthquakes: earthquakes.status === 'fulfilled' ? 'USGS' : 'UNAVAILABLE',
        disasters: gdacs.status === 'fulfilled' ? 'GDACS' : 'UNAVAILABLE',
        facilities: 'OPENSTREETMAP_FILE',
      },
      fetchedAt: new Date(now()).toISOString(),
    };

    cache.set(key, { value, expiresAt: now() + CACHE_MS });
    logger.info({ lat, lng, disasters: value.disasters.length, facilities: value.facilities.length }, 'geo.live_context');
    return value;
  }

  return { get };
}

export const liveContextService = createLiveContextService();
