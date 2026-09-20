import { io } from 'socket.io-client';

const endpoint = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:4000';
const socket = io(endpoint, { autoConnect: false });
const rooms = new Set();

socket.on('connect', () => {
  for (const room of rooms) socket.emit('subscribe', { room });
});

function request(action, room) {
  return new Promise((resolve) => socket.emit(action, { room }, resolve));
}

export const realtimeClient = {
  connect: () => socket.connect(),
  disconnect: () => socket.disconnect(),
  on: (event, listener) => socket.on(event, listener),
  off: (event, listener) => socket.off(event, listener),
  onManager: (event, listener) => socket.io.on(event, listener),
  offManager: (event, listener) => socket.io.off(event, listener),
  async subscribe(room) {
    rooms.add(room);
    if (!socket.connected) return { ok: true, room, pending: true };
    const result = await request('subscribe', room);
    if (!result?.ok) rooms.delete(room);
    return result;
  },
  async unsubscribe(room) {
    rooms.delete(room);
    if (!socket.connected) return { ok: true, room };
    return request('unsubscribe', room);
  },
};
