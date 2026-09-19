import { monitoringService } from '../services/monitoring/monitoring-service.js';

export async function runMonitoring(request, response) {
  const data = await monitoringService.run({ correlationId: request.id });
  response.status(200).json({ success: true, data });
}

export function getMonitoringStatus(_request, response) {
  response.status(200).json({ success: true, data: monitoringService.status() });
}
