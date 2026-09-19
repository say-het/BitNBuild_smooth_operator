import { env } from '../../config/env.js';

export const ALERT_SEVERITY = Object.freeze({ INFO: 1, WARNING: 2, HIGH: 3, CRITICAL: 4 });
export const ALERT_SEVERITY_NAME = Object.freeze(Object.fromEntries(
  Object.entries(ALERT_SEVERITY).map(([name, value]) => [value, name]),
));

export const MONITORING_CONFIG = Object.freeze({
  enabled: env.MONITORING_ENABLED,
  intervalMs: env.MONITORING_INTERVAL_MS,
  slaMinutes: Object.freeze({
    P0: env.SLA_P0_MINUTES,
    P1: env.SLA_P1_MINUTES,
    P2: env.SLA_P2_MINUTES,
    P3: env.SLA_P3_MINUTES,
  }),
  stallMinutes: Object.freeze({
    ASSESSING: env.ASSESSING_STALL_MINUTES,
    RESOURCE_RECOMMENDED: env.RESOURCE_RECOMMENDED_STALL_MINUTES,
    RESOURCE_ASSIGNED: env.RESOURCE_ASSIGNED_STALL_MINUTES,
    ON_SCENE: env.ON_SCENE_STALL_MINUTES,
  }),
  enRouteGraceMinutes: env.EN_ROUTE_GRACE_MINUTES,
  hospitalCapacityThresholdPercent: env.HOSPITAL_CAPACITY_THRESHOLD_PERCENT,
  escalationEnabled: env.ESCALATION_ENABLED,
  escalationDelayMinutes: env.ESCALATION_DELAY_MINUTES,
});
