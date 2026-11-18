'use strict';


class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const Errors = {
  badRequest: (message, details) => new AppError(400, 'BAD_REQUEST', message, details),
  validation: (details) => new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details),
  invalidJson: () => new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON'),
  unauthorized: (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError(403, 'FORBIDDEN', message),
  notFound: (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`),
  conflict: (code, message) => new AppError(409, code, message),
  unsupportedMediaType: () =>
    new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json'),
  /** Request was well-formed but violates a business rule. */
  businessRule: (code, message, details) => new AppError(422, code, message, details),
  badGateway: (code, message) => new AppError(502, code, message),
  serviceUnavailable: (message = 'Service temporarily unavailable') =>
    new AppError(503, 'SERVICE_UNAVAILABLE', message),
};

const isUniqueViolation = (error, constraint) =>
  error?.code === '23505' && (!constraint || error.constraint === constraint);

module.exports = { AppError, Errors, isUniqueViolation };
