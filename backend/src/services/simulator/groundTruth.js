import { ValidationError } from '../../errors/application-error.js';

export function validateGroundTruth(incidents) {
  if (!Array.isArray(incidents) || incidents.length === 0) {
    throw new ValidationError('Scenario must define hidden ground truth');
  }
  for (const incident of incidents) {
    if (!incident.incidentId || !incident.type || !incident.location) {
      throw new ValidationError('Invalid scenario ground truth');
    }
    if (!Number.isInteger(incident.severity) || incident.severity < 1 || incident.severity > 5) {
      throw new ValidationError('Ground-truth severity must be between 1 and 5');
    }
  }
  return incidents;
}

export function createSimulationEvaluationService(repository) {
  return {
    async getEvaluationInput(runId) {
      const truth = await repository.getGroundTruth(runId);
      return truth.map((item) => item.truth);
    },
  };
}
