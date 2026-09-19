import { CORRELATION_CONFIG } from './correlation-config.js';

const STOP_WORDS = new Set(['a', 'an', 'and', 'at', 'for', 'from', 'in', 'is', 'near', 'of', 'on', 'the', 'to', 'with']);
const TYPE_COMPATIBILITY = Object.freeze({
  FIRE: new Set(['HAZMAT']),
  HAZMAT: new Set(['FIRE']),
  EARTHQUAKE: new Set(['BUILDING_COLLAPSE', 'INFRASTRUCTURE_FAILURE']),
  BUILDING_COLLAPSE: new Set(['EARTHQUAKE']),
  INFRASTRUCTURE_FAILURE: new Set(['EARTHQUAKE']),
});

function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length > 2 && !STOP_WORDS.has(token)) ?? []);
}

function jaccard(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  if (left.size === 0 || right.size === 0) return null;
  const overlap = [...left].filter((value) => right.has(value)).length;
  return overlap / (left.size + right.size - overlap);
}

function typeScore(candidateType, incidentType) {
  if (candidateType === incidentType) return 1;
  return TYPE_COMPATIBILITY[candidateType]?.has(incidentType) ? 0.55 : 0;
}

function rounded(value) {
  return Math.round(value * 1_000) / 1_000;
}

export function scoreCorrelation(candidate, incident, config = CORRELATION_CONFIG) {
  const distanceMeters = incident.distanceMeters === null || incident.distanceMeters === undefined
    ? null : Number(incident.distanceMeters);
  const timeDifferenceSeconds = Math.abs(Number(incident.timeDifferenceSeconds));
  const semantic = jaccard(
    tokens(`${candidate.title} ${candidate.summary}`),
    tokens(`${incident.title} ${incident.summary ?? ''}`),
  );
  const hazard = jaccard(candidate.hazards ?? [], incident.hazards ?? []);
  const capability = jaccard(candidate.requiredCapabilities ?? [], incident.requiredCapabilities ?? []);
  const hazardCapability = hazard === null && capability === null
    ? null : Math.max(hazard ?? 0, capability ?? 0);
  const signals = {
    geographic: distanceMeters === null ? null : Math.max(0, 1 - distanceMeters / config.maxDistanceMeters),
    temporal: Math.max(0, 1 - timeDifferenceSeconds / config.maxTimeDifferenceSeconds),
    type: typeScore(candidate.incidentType, incident.type),
    semantic,
    hazardCapability,
  };

  let weighted = 0;
  let availableWeight = 0;
  for (const [name, value] of Object.entries(signals)) {
    if (value === null) continue;
    weighted += value * config.weights[name];
    availableWeight += config.weights[name];
  }
  const score = availableWeight ? rounded(weighted / availableWeight) : 0;
  const matchedSignals = [];
  if ((signals.geographic ?? 0) >= 0.5) matchedSignals.push('nearby');
  if (signals.temporal >= 0.5) matchedSignals.push('close_in_time');
  if (signals.type === 1) matchedSignals.push('same_type');
  else if (signals.type > 0) matchedSignals.push('compatible_type');
  if ((signals.semantic ?? 0) >= 0.35) matchedSignals.push('similar_text');
  if ((signals.hazardCapability ?? 0) > 0) matchedSignals.push('shared_hazard_or_capability');

  const hasSupportingSignal = (signals.geographic ?? 0) >= 0.5 || (signals.semantic ?? 0) >= 0.35 || (signals.hazardCapability ?? 0) > 0;
  const correlated = score >= config.thresholds.highMatch && signals.type > 0 && hasSupportingSignal;
  const decision = correlated ? 'CORRELATED' : score >= config.thresholds.mediumMatch ? 'POSSIBLE_MATCH' : 'NEW_INCIDENT';
  const reasonParts = [
    distanceMeters === null ? 'distance unavailable' : `${Math.round(distanceMeters)}m apart`,
    `${Math.round(timeDifferenceSeconds)}s apart`,
    signals.type === 1 ? `same type ${candidate.incidentType}` : `type score ${signals.type}`,
    `semantic ${rounded(semantic ?? 0)}`,
    `hazard/capability ${rounded(hazardCapability ?? 0)}`,
  ];
  return {
    score,
    decision,
    matchedSignals,
    reason: reasonParts.join('; '),
    signals: Object.fromEntries(Object.entries(signals).map(([key, value]) => [key, value === null ? null : rounded(value)])),
    distanceMeters: distanceMeters === null ? null : Math.round(distanceMeters),
    timeDifferenceSeconds: Math.round(timeDifferenceSeconds),
  };
}

export function chooseRelationship({ event, match, score }, config = CORRELATION_CONFIG) {
  if (event.eventType === 'FIELD_UPDATE') return 'FIELD_UPDATE';
  const previouslyReportedBySource = match.eventSources?.includes(event.source) ?? event.source === match.latestSource;
  if (
    previouslyReportedBySource &&
    (score.signals.semantic ?? 0) >= config.thresholds.duplicateSemantic &&
    (score.distanceMeters ?? Infinity) <= config.duplicate.maxDistanceMeters &&
    score.timeDifferenceSeconds <= config.duplicate.maxTimeDifferenceSeconds
  ) return 'DUPLICATE';
  if (!previouslyReportedBySource) return 'CORROBORATING_SIGNAL';
  return 'SUPPORTING_SIGNAL';
}
