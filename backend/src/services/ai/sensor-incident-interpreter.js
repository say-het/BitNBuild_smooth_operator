import { priorityForSeverity } from './incident-intelligence-contract.js';

function number(payload, keys) {
  for (const key of keys) {
    if (typeof payload[key] === 'number' && Number.isFinite(payload[key])) return payload[key];
  }
  return undefined;
}

function candidate(event, assessment) {
  const location = event.latitude === null || event.latitude === undefined
    ? (event.location ?? null)
    : { lat: Number(event.latitude), lng: Number(event.longitude) };
  return {
    ...assessment,
    priority: priorityForSeverity(assessment.severity),
    confidence: assessment.confidence,
    estimatedVictims: null,
    estimatedInjured: null,
    estimatedTrapped: null,
    location,
    locationConfidence: location ? 1 : null,
  };
}

export function interpretSensorEvent(event) {
  const payload = event.payload ?? {};
  const readingType = String(payload.readingType ?? '').toLowerCase();
  const smoke = number(payload, ['smokePpm', 'smokeLevel']);
  const temperature = number(payload, ['temperature', 'temperatureC']);
  const gas = number(payload, ['carbonMonoxidePpm', 'gasPpm']);
  if ((smoke ?? 0) >= 70 || (temperature ?? 0) >= 55 || (gas ?? 0) >= 50 || readingType.includes('smoke') || readingType.includes('gas')) {
    const severity = (smoke ?? 0) >= 180 || (temperature ?? 0) >= 85 || (gas ?? 0) >= 80 ? 4 : 3;
    return candidate(event, {
      incidentType: 'FIRE', title: 'Fire-related sensor anomaly',
      summary: 'Structured sensor readings indicate elevated heat, smoke, or combustion gas.', severity,
      confidence: 0.86, hazards: ['fire', 'smoke'], requiredCapabilities: ['fire_response'],
      evidence: [`structured sensor threshold exceeded (${readingType || 'fire signal'})`],
    });
  }

  const water = number(payload, ['waterLevelMeters', 'waterLevel']);
  if ((water ?? 0) >= 1.5 || readingType.includes('flood')) {
    const severity = (water ?? 0) >= 3 ? 4 : 3;
    return candidate(event, {
      incidentType: 'FLOOD', title: 'Flood-level sensor anomaly',
      summary: 'Structured water-level readings indicate significant flooding risk.', severity,
      confidence: 0.88, hazards: ['floodwater'], requiredCapabilities: ['water_rescue', 'evacuation'],
      evidence: [`water level threshold exceeded (${water ?? 'reported flood threshold'})`],
    });
  }

  const acceleration = number(payload, ['groundAccelerationG']);
  const vibration = number(payload, ['vibrationMmS']);
  const stress = number(payload, ['structuralStressMpa']);
  if ((acceleration ?? 0) >= 0.1 || (vibration ?? 0) >= 20 || (stress ?? 0) >= 30 || readingType.includes('aftershock')) {
    return candidate(event, {
      incidentType: stress ? 'INFRASTRUCTURE_FAILURE' : 'EARTHQUAKE', title: 'Seismic sensor anomaly',
      summary: 'Structured vibration or structural readings indicate a seismic or damage event.', severity: 4,
      confidence: 0.9, hazards: ['structural_damage'], requiredCapabilities: ['heavy_rescue', 'search_and_rescue'],
      evidence: [`seismic or structural threshold exceeded (${readingType || 'sensor reading'})`],
    });
  }

  const impact = number(payload, ['impactG']);
  const congestion = number(payload, ['congestion']);
  if ((impact ?? 0) >= 1.5 || (congestion ?? 0) >= 0.75 || readingType.includes('impact')) {
    return candidate(event, {
      incidentType: 'ROAD_ACCIDENT', title: 'Traffic impact sensor anomaly',
      summary: 'Structured impact and traffic readings indicate a probable road collision.', severity: 3,
      confidence: 0.84, hazards: ['traffic'], requiredCapabilities: ['medical', 'police'],
      evidence: [`impact or congestion threshold exceeded (${readingType || 'traffic sensor'})`],
    });
  }
  return null;
}
