export const ASSIGNMENT_TRANSITIONS = Object.freeze({
  ASSIGNED: ['ACCEPTED', 'EN_ROUTE', 'CANCELLED', 'REASSIGNED'],
  ACCEPTED: ['EN_ROUTE', 'CANCELLED', 'REASSIGNED'],
  EN_ROUTE: ['ON_SCENE', 'CANCELLED', 'REASSIGNED'],
  ON_SCENE: ['COMPLETED', 'CANCELLED', 'REASSIGNED'],
  COMPLETED: [],
  CANCELLED: [],
  REASSIGNED: [],
});

export const RESOURCE_STATUS_FOR_ASSIGNMENT = Object.freeze({
  ASSIGNED: 'ASSIGNED',
  ACCEPTED: 'ASSIGNED',
  EN_ROUTE: 'EN_ROUTE',
  ON_SCENE: 'ON_SCENE',
  COMPLETED: 'AVAILABLE',
  CANCELLED: 'AVAILABLE',
  REASSIGNED: 'AVAILABLE',
});

export const ACTIVE_ASSIGNMENT_STATUSES = Object.freeze(['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ON_SCENE']);

export function presentAssignment(assignment) {
  return {
    assignmentId: assignment.assignmentId,
    incidentId: assignment.incident?.incidentId,
    resourceId: assignment.resource?.resourceId,
    status: assignment.status,
    origin: assignment.origin,
    role: assignment.role,
    assignedAt: assignment.assignedAt,
    acceptedAt: assignment.acceptedAt,
    departedAt: assignment.departedAt,
    arrivedAt: assignment.arrivedAt,
    completedAt: assignment.completedAt,
    estimatedArrival: assignment.estimatedArrival,
    actualArrival: assignment.actualArrival,
    assignmentReason: assignment.assignmentReason,
    distanceMeters: assignment.distanceMeters,
    estimatedTravelTimeSeconds: assignment.estimatedTravelTime,
    optimizationScore: assignment.optimizationScore === null || assignment.optimizationScore === undefined
      ? null
      : Number(assignment.optimizationScore),
    metadata: assignment.metadata,
  };
}
