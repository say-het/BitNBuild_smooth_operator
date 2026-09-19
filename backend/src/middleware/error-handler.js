import { logger } from '../config/logger.js';

export function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Route ${request.method} ${request.originalUrl} was not found`,
    },
  });
}

export function errorHandler(error, request, response, _next) {
  const isMalformedJson = error.type === 'entity.parse.failed';
  const isKnownConflict = error.code === 'P2002';
  const isMissingRecord = error.code === 'P2025';
  const statusCode = isMalformedJson
    ? 400
    : isKnownConflict
    ? 409
    : isMissingRecord
      ? 404
      : Number.isInteger(error.statusCode)
        ? error.statusCode
        : 500;

  logger.error(
    { err: error, requestId: request.id, method: request.method, path: request.originalUrl },
    'Request failed',
  );

  response.status(statusCode).json({
    error: {
      code: isMalformedJson
        ? 'INVALID_JSON'
        : isKnownConflict
        ? 'RESOURCE_CONFLICT'
        : isMissingRecord
          ? 'RESOURCE_NOT_FOUND'
          : (error.code ?? 'INTERNAL_SERVER_ERROR'),
      message: isMalformedJson
        ? 'Request body contains malformed JSON'
        : isKnownConflict
        ? 'A record with the same unique identifier already exists'
        : isMissingRecord
          ? 'The requested record was not found'
          : statusCode >= 500
            ? 'An unexpected error occurred'
            : error.message,
      ...(statusCode < 500 && error.details ? { details: error.details } : {}),
      requestId: request.id,
    },
  });
}
