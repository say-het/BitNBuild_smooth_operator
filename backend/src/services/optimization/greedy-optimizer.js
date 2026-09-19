const PRIORITY_RANK = Object.freeze({ P0: 0, P1: 1, P2: 2, P3: 3 });
const PRIORITY_WEIGHT = Object.freeze({ P0: 16, P1: 8, P2: 4, P3: 2 });

function requirementsFor(incident) {
  return incident.requirements ?? incident.requiredCapabilities.map((capability) => ({ capability, quantity: 1 }));
}

export function greedyOptimize({ incidents, resources, candidates }) {
  const resourceById = new Map(resources.map((resource) => [resource.resourceId, resource]));
  const candidatesByIncident = new Map();
  for (const candidate of candidates) {
    const list = candidatesByIncident.get(candidate.incidentId) ?? [];
    list.push(candidate);
    candidatesByIncident.set(candidate.incidentId, list);
  }
  for (const list of candidatesByIncident.values()) {
    list.sort((left, right) => right.score - left.score
      || left.etaMinutes - right.etaMinutes
      || left.resourceId.localeCompare(right.resourceId));
  }

  const usedResources = new Map();
  const assignments = new Map();
  const unfulfilledRequirements = [];
  const orderedIncidents = [...incidents].sort((left, right) =>
    (PRIORITY_RANK[left.priority] ?? 99) - (PRIORITY_RANK[right.priority] ?? 99)
    || right.severity - left.severity
    || left.incidentId.localeCompare(right.incidentId));

  for (const incident of orderedIncidents) {
    for (const requirement of requirementsFor(incident)) {
      for (let unit = 0; unit < requirement.quantity; unit += 1) {
        const eligible = (candidatesByIncident.get(incident.incidentId) ?? []).filter((candidate) => {
          const resource = resourceById.get(candidate.resourceId);
          const owner = usedResources.get(candidate.resourceId);
          const assignment = assignments.get(`${incident.incidentId}:${candidate.resourceId}`);
          return resource?.capabilities.includes(requirement.capability)
            && (!owner || owner === incident.incidentId)
            && !assignment?.capabilitiesCovered.includes(requirement.capability);
        });
        const selected = eligible[0];
        if (!selected) {
          unfulfilledRequirements.push({ incidentId: incident.incidentId, capability: requirement.capability });
          continue;
        }
        usedResources.set(selected.resourceId, incident.incidentId);
        const key = `${incident.incidentId}:${selected.resourceId}`;
        const assignment = assignments.get(key) ?? {
          incidentId: incident.incidentId,
          resourceId: selected.resourceId,
          capabilitiesCovered: [],
          etaMinutes: selected.etaMinutes,
          score: selected.score,
          reasonFactors: selected.reasonFactors,
        };
        assignment.capabilitiesCovered.push(requirement.capability);
        assignments.set(key, assignment);
      }
    }
  }

  const assignmentList = [...assignments.values()];
  const objectiveValue = assignmentList.reduce((total, assignment) => {
    const incident = incidents.find(({ incidentId }) => incidentId === assignment.incidentId);
    return total + assignment.etaMinutes * (PRIORITY_WEIGHT[incident.priority] ?? 1);
  }, 0) + unfulfilledRequirements.reduce((total, requirement) => {
    const incident = incidents.find(({ incidentId }) => incidentId === requirement.incidentId);
    return total + 1_000 * (PRIORITY_WEIGHT[incident.priority] ?? 1);
  }, 0);

  return {
    status: unfulfilledRequirements.length ? 'PARTIAL' : 'FEASIBLE',
    optimizer: 'FALLBACK_GREEDY',
    assignments: assignmentList,
    unfulfilledRequirements,
    objectiveValue,
  };
}
