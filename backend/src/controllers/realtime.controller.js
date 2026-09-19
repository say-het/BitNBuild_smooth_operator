import { realtimeService } from '../sockets/realtime-service.js';

export function getRealtimeStatus(_request, response) {
  response.status(200).json({ data: realtimeService.status() });
}
