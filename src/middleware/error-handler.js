'use strict';

const logger = require('../lib/logger');
const { AppError, Errors } = require('../lib/errors');

//Wraps an array of async middleware functions and returns a single middleware function that executes them in order, passing any errors to the next error handler.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist`));
}


function errorHandler(err, req, res, _next) {
  let error = err;

  if (err.type === 'entity.parse.failed') error = Errors.invalidJson();
  else if (err.type === 'entity.too.large') error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  if (!(error instanceof AppError)) {
    logger.error('Unhandled error', { error: err.message, stack: err.stack, path: req.originalUrl });
    error = new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.');
  } else if (error.statusCode >= 500) {
    logger.error(error.message, { code: error.code });
  }

  res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details && { details: error.details }),
      requestId: req.id,
    },
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
