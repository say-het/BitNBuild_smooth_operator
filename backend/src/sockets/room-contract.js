const ENTITY_ROOM = /^(incident|resource|simulation):[A-Za-z0-9_-]{1,128}$/;
const SHARED_ROOMS = new Set(['operations', 'alerts']);

export function isAllowedRoom(room) {
  return typeof room === 'string' && (SHARED_ROOMS.has(room) || ENTITY_ROOM.test(room));
}

export function roomsFor(entityType, entityId, data = {}) {
  const rooms = new Set(['operations']);
  if (entityType === 'INCIDENT') rooms.add(`incident:${entityId}`);
  if (entityType === 'RESOURCE') {
    rooms.add(`resource:${entityId}`);
    if (data.incidentId) rooms.add(`incident:${data.incidentId}`);
  }
  if (entityType === 'ASSIGNMENT') {
    if (data.incidentId) rooms.add(`incident:${data.incidentId}`);
    if (data.resourceId) rooms.add(`resource:${data.resourceId}`);
  }
  if (entityType === 'ALERT') {
    rooms.add('alerts');
    if (data.incidentId) rooms.add(`incident:${data.incidentId}`);
    if (data.resourceId) rooms.add(`resource:${data.resourceId}`);
  }
  if (entityType === 'SIMULATION') rooms.add(`simulation:${entityId}`);
  return [...rooms];
}
