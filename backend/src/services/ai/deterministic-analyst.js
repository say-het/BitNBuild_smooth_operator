import { situationAnalysisSchema } from './situation-analysis-contract.js';

/**
 * Deterministic rule-based situation analyst.
 * Produces structured, explainable briefings grounded in authoritative operational state
 * when Gemini AI is unconfigured or temporarily unavailable.
 */
export function generateDeterministicSituationAnalysis(context) {
  const incident = context.incident ?? {};
  const assignments = context.assignments ?? [];
  const alerts = context.alerts ?? [];
  const nearbyHospitals = context.nearbyHospitals ?? [];
  const requiredCaps = incident.requiredCapabilities ?? [];

  // 1. Summary
  const casualtyDetails = [];
  if (incident.estimatedVictims) casualtyDetails.push(`${incident.estimatedVictims} estimated victims`);
  if (incident.estimatedInjured) casualtyDetails.push(`${incident.estimatedInjured} injured`);
  if (incident.estimatedTrapped) casualtyDetails.push(`${incident.estimatedTrapped} trapped`);
  const casualtyText = casualtyDetails.length ? ` Casualties reported: ${casualtyDetails.join(', ')}.` : '';
  const hazardText = incident.hazards?.length ? ` Hazards identified: ${incident.hazards.join(', ')}.` : '';
  const summary = `${incident.title || 'Incident'} (${incident.priority || 'P2'} ${incident.type || 'GENERAL'}, Severity ${incident.severity ?? 2}/5). Status is currently ${incident.status || 'CREATED'}.${casualtyText}${hazardText}`.slice(0, 1000);

  // 2. Current Response
  let currentResponse = null;
  if (assignments.length === 0) {
    currentResponse = 'No emergency response units are currently assigned or on scene for this incident.';
  } else {
    const unitList = assignments.map((a) => {
      const name = a.resource?.name || a.resourceId;
      const status = (a.status || 'ASSIGNED').replaceAll('_', ' ');
      const eta = a.etaMinutes ? `, ETA ~${a.etaMinutes}m` : '';
      return `${name} (${status}${eta})`;
    });
    currentResponse = `${assignments.length} unit(s) deployed: ${unitList.join('; ')}.`.slice(0, 1000);
  }

  // 3. Key Risks
  const keyRisks = [];
  if (incident.priority === 'P0' || incident.priority === 'P1') {
    keyRisks.push(`High operational priority (${incident.priority}) demands immediate on-scene containment.`);
  }
  if ((incident.severity ?? 0) >= 3) {
    keyRisks.push(`Elevated incident severity (${incident.severity}/5) presents expanding hazard zone.`);
  }
  if (incident.hazards?.length) {
    keyRisks.push(`Hazard exposure risk: ${incident.hazards.join(', ')}.`);
  }
  if (incident.estimatedTrapped) {
    keyRisks.push(`Entrapment risk: ${incident.estimatedTrapped} individual(s) reported trapped requiring technical extrication.`);
  }
  if (assignments.length === 0 && incident.status !== 'RESOLVED' && incident.status !== 'CANCELLED') {
    keyRisks.push('Zero active assignments: scene remains unmitigated until responders arrive.');
  }
  alerts.forEach((alert) => {
    if (keyRisks.length < 8) {
      keyRisks.push(`Active alert (${alert.type}): ${alert.title || alert.message}`);
    }
  });
  if (keyRisks.length === 0) {
    keyRisks.push('Standard response risks apply; monitor perimeter and incoming telemetry.');
  }

  // 4. Resource Gaps
  const assignedCapabilities = new Set();
  assignments.forEach((a) => {
    (a.resource?.capabilities ?? []).forEach((c) => assignedCapabilities.add(typeof c === 'string' ? c : c.code));
  });

  const resourceGaps = [];
  requiredCaps.forEach((cap) => {
    const code = typeof cap === 'string' ? cap : cap.code;
    if (code && !assignedCapabilities.has(code)) {
      resourceGaps.push(`Unfulfilled: ${code.replaceAll('_', ' ')}`);
    }
  });
  (context.resourceShortages ?? []).forEach((shortage) => {
    if (resourceGaps.length < 6) {
      resourceGaps.push(shortage.title || 'Regional resource shortage');
    }
  });

  // 5. Hospital Considerations
  const hospitalConsiderations = [];
  if (nearbyHospitals.length > 0) {
    const primary = nearbyHospitals[0];
    const dist = primary.distanceMeters ? ` ~${(primary.distanceMeters / 1000).toFixed(1)}km` : '';
    hospitalConsiderations.push(
      `Primary receiving hospital: ${primary.name}${dist} (${primary.availableBeds ?? 0} beds, ${primary.availableIcuBeds ?? 0} ICU beds available).`,
    );
    const overloaded = nearbyHospitals.filter((h) => h.status === 'OVERLOADED');
    if (overloaded.length > 0) {
      hospitalConsiderations.push(`Avoid overloaded hospitals: ${overloaded.map((h) => h.name).join(', ')}.`);
    }
    const lowIcu = nearbyHospitals.filter((h) => (h.availableIcuBeds ?? 0) <= 2 && h.status !== 'OVERLOADED');
    if (lowIcu.length > 0) {
      hospitalConsiderations.push(`Restricted ICU capacity at ${lowIcu.map((h) => h.name).join(', ')}.`);
    }
  } else {
    hospitalConsiderations.push('No nearby hospital telemetry linked to current incident sector.');
  }

  // 6. Recommended Actions
  const recommendedActions = [];
  if (resourceGaps.length > 0) {
    recommendedActions.push({
      type: 'REVIEW_RESOURCE_GAP',
      description: `Review optimizer plan to dispatch units for unfulfilled capabilities: ${resourceGaps.slice(0, 3).join(', ')}.`.slice(0, 300),
    });
  }
  if (assignments.length === 0 && incident.status !== 'RESOLVED' && incident.status !== 'CANCELLED') {
    recommendedActions.push({
      type: 'REVIEW_RESPONSE_DELAY',
      description: 'Prioritize initial resource assignment to avoid response SLA expiration.',
    });
  }
  if (alerts.some((a) => a.type === 'RESPONSE_DELAY' || a.type === 'ESCALATION')) {
    recommendedActions.push({
      type: 'REVIEW_ESCALATION',
      description: 'Acknowledge active monitoring alerts and assess mutual aid escalation.',
    });
  }
  if (hospitalConsiderations.some((c) => c.includes('overloaded') || c.includes('Restricted ICU'))) {
    recommendedActions.push({
      type: 'REVIEW_HOSPITAL_CAPACITY',
      description: 'Coordinate patient routing with regional trauma dispatch to balance hospital load.',
    });
  }
  recommendedActions.push({
    type: 'MONITOR_INCIDENT',
    description: 'Maintain telemetry stream and observation timeline correlation for scene updates.',
  });

  const confidence = Math.min(0.95, Math.max(0.70, Number(incident.confidence) || 0.85));

  return situationAnalysisSchema.parse({
    incidentId: incident.incidentId,
    summary,
    currentResponse,
    keyRisks: keyRisks.slice(0, 10),
    resourceGaps: resourceGaps.slice(0, 10),
    hospitalConsiderations: hospitalConsiderations.slice(0, 10),
    recommendedActions: recommendedActions.slice(0, 8),
    confidence,
  });
}
