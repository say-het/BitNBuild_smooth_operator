import { analyticsService } from '../services/analytics/analytics-service.js';

export async function getAnalyticsOverview(_request, response) {
  response.status(200).json({ success: true, data: await analyticsService.overview() });
}
