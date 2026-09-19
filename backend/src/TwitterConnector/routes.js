import { Router } from 'express';
import { twitterConnector } from './connector.js';

export const twitterConnectorRouter = Router();

/**
 * GET /status - Returns current connection status, statistics, and keyword filter list
 */
twitterConnectorRouter.get('/status', (_req, res) => {
  res.status(200).json({
    success: true,
    data: twitterConnector.getStatus(),
  });
});

/**
 * GET / - Alias for status
 */
twitterConnectorRouter.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    data: twitterConnector.getStatus(),
  });
});

/**
 * GET /incidents - Returns list of detected incidents with optional keyword filtering & limit
 */
twitterConnectorRouter.get('/incidents', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
  const keyword = req.query.keyword ? String(req.query.keyword).toLowerCase() : null;
  const source = req.query.source ? String(req.query.source).toUpperCase() : null;

  let incidents = twitterConnector.getIncidents(limit, source);

  if (keyword) {
    incidents = incidents.filter((incident) =>
      (incident.matched && incident.matched.some((k) => k.toLowerCase().includes(keyword))) ||
      (incident.text && incident.text.toLowerCase().includes(keyword)) ||
      (incident.author && incident.author.toLowerCase().includes(keyword))
    );
  }

  res.status(200).json({
    success: true,
    count: incidents.length,
    data: incidents,
  });
});

/**
 * POST /start - Manually starts the WebSocket connection
 */
twitterConnectorRouter.post('/start', (_req, res) => {
  twitterConnector.start();
  res.status(200).json({
    success: true,
    message: 'TwitterConnector stream started',
    status: twitterConnector.getStatus(),
  });
});

/**
 * POST /stop - Manually stops the WebSocket connection
 */
twitterConnectorRouter.post('/stop', (_req, res) => {
  twitterConnector.stop();
  res.status(200).json({
    success: true,
    message: 'TwitterConnector stream stopped',
    status: twitterConnector.getStatus(),
  });
});

/**
 * DELETE /incidents - Clears detected incidents history in memory
 */
twitterConnectorRouter.delete('/incidents', (_req, res) => {
  twitterConnector.clearIncidents();
  res.status(200).json({
    success: true,
    message: 'Incidents buffer cleared',
  });
});

/**
 * GET /stream - Server-Sent Events (SSE) stream for real-time incident notifications
 */
twitterConnectorRouter.get('/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const handleIncident = (incident) => {
    res.write(`data: ${JSON.stringify(incident)}\n\n`);
  };

  twitterConnector.on('incident', handleIncident);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected' })}\n\n`);

  req.on('close', () => {
    twitterConnector.off('incident', handleIncident);
  });
});
