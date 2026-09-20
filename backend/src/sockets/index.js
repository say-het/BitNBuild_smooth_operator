import { logger } from '../config/logger.js';
import { isAllowedRoom } from './room-contract.js';
import { realtimeService } from './realtime-service.js';

export const SOCKET_EVENT_CATEGORIES = Object.freeze([
  'incident.created', 'incident.updated', 'incident.state_changed', 'incident.resolved', 'incident.escalated',
  'resource.updated', 'resource.location_updated', 'resource.assigned', 'resource.released',
  'assignment.created', 'assignment.updated', 'assignment.cancelled',
  'alert.created', 'alert.updated', 'alert.resolved', 'hospital.updated',
  'simulation.started', 'simulation.paused', 'simulation.resumed', 'simulation.stopped',
  'simulation.completed', 'simulation.event', 'system.notification',
]);

function roomError() {
  return { ok: false, error: { code: 'INVALID_REALTIME_ROOM', message: 'Room is not part of the realtime room contract' } };
}

async function changeSubscription(socket, action, room, acknowledge) {
  const reply = typeof acknowledge === 'function' ? acknowledge : () => {};
  if (!isAllowedRoom(room)) return reply(roomError());
  try {
    await socket[action](room);
    logger.info({ socketId: socket.id, room }, action === 'join' ? 'realtime.room_joined' : 'realtime.room_left');
    return reply({ ok: true, room });
  } catch (error) {
    logger.error({ err: error, socketId: socket.id, room, action }, 'realtime.room_change_failed');
    return reply({ ok: false, error: { code: 'REALTIME_ROOM_CHANGE_FAILED', message: 'Room subscription could not be changed' } });
  }
}

export function registerSocketHandlers(io) {
  realtimeService.setServer(io);

  // Authentication can replace this neutral identity without changing room or event contracts.
  io.use((socket, next) => {
    socket.data.identity = { role: null, resourceId: null };
    socket.data.connectedAt = new Date().toISOString();
    next();
  });

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'realtime.client_connected');

    socket.on('subscribe', ({ room } = {}, acknowledge) => changeSubscription(socket, 'join', room, acknowledge));
    socket.on('unsubscribe', ({ room } = {}, acknowledge) => changeSubscription(socket, 'leave', room, acknowledge));

    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'realtime.client_disconnected');
    });
  });
}
