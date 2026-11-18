'use strict';

const { randomUUID } = require('node:crypto');
const { runWithContext } = require('../lib/context');
const logger = require('../lib/logger');

const REQUEST_ID_PATTERN = /^[\w-]{8,64}$/;

//assign unique request id
function requestContext(req, res, next) {
  const inbound = req.get('x-request-id');
  const requestId = inbound && REQUEST_ID_PATTERN.test(inbound) ? inbound : randomUUID();
  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  runWithContext({ requestId }, () => next());
}

// access log
function requestLogger(req, res, next) {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level, `${req.method} ${req.originalUrl} ${res.statusCode}`, {
      requestId: req.id,
      userId: req.user?.id,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });
  });
  next();
}

module.exports = { requestContext, requestLogger };
