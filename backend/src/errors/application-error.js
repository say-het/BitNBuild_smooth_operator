export class ApplicationError extends Error {
  constructor(message, { code = 'APPLICATION_ERROR', statusCode = 500, details } = {}) {
    super(message);
    this.name = 'ApplicationError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message, details) {
    super(message, { code: 'VALIDATION_ERROR', statusCode: 400, details });
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message) {
    super(message, { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
    this.name = 'NotFoundError';
  }
}
