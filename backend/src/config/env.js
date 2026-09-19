import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const booleanValue = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().optional(),
  REALTIME_REDIS_ENABLED: booleanValue.default(false),
  REALTIME_REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(1_500),
  REALTIME_LOCATION_THROTTLE_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().max(120_000).default(20_000),
  OSRM_BASE_URL: z.string().url().default('https://router.project-osrm.org'),
  ROUTING_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(5_000),
  ROUTE_CACHE_TTL_SECONDS: z.coerce.number().int().positive().max(3_600).default(60),
  ROUTING_FALLBACK_SPEED_KPH: z.coerce.number().positive().max(200).default(30),
  OPENROUTESERVICE_API_KEY: z.string().optional(),
  OPENROUTESERVICE_BASE_URL: z.string().url().default('https://api.openrouteservice.org'),
  OPEN_METEO_URL: z.string().url().default('https://api.open-meteo.com/v1/forecast'),
  USGS_EARTHQUAKE_URL: z.string().url().default('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson'),
  GDACS_EVENTS_URL: z.string().url().default('https://www.gdacs.org/gdacsapi/api/Events/geteventlist/EVENTS4APP'),
  OVERPASS_URL: z.string().url().default('https://overpass-api.de/api/interpreter'),
  OVERPASS_FALLBACK_URL: z.string().url().default('https://overpass.kumi.systems/api/interpreter'),
  OPTIMIZER_URL: z.string().url().default('http://127.0.0.1:8081'),
  OPTIMIZER_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(3_000),
  MONITORING_ENABLED: booleanValue.default(true),
  MONITORING_INTERVAL_MS: z.coerce.number().int().min(5_000).max(3_600_000).default(30_000),
  SLA_P0_MINUTES: z.coerce.number().positive().max(240).default(10),
  SLA_P1_MINUTES: z.coerce.number().positive().max(240).default(20),
  SLA_P2_MINUTES: z.coerce.number().positive().max(240).default(35),
  SLA_P3_MINUTES: z.coerce.number().positive().max(240).default(60),
  ASSESSING_STALL_MINUTES: z.coerce.number().positive().max(1_440).default(15),
  RESOURCE_RECOMMENDED_STALL_MINUTES: z.coerce.number().positive().max(1_440).default(10),
  RESOURCE_ASSIGNED_STALL_MINUTES: z.coerce.number().positive().max(1_440).default(10),
  ON_SCENE_STALL_MINUTES: z.coerce.number().positive().max(1_440).default(60),
  EN_ROUTE_GRACE_MINUTES: z.coerce.number().nonnegative().max(240).default(5),
  HOSPITAL_CAPACITY_THRESHOLD_PERCENT: z.coerce.number().min(0).max(100).default(10),
  ESCALATION_ENABLED: booleanValue.default(true),
  ESCALATION_DELAY_MINUTES: z.coerce.number().positive().max(240).default(10),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
  throw new Error(`Invalid environment configuration: ${fields}`);
}

export const env = Object.freeze(parsed.data);
