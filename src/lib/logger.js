'use strict';

//global logger
const winston = require('winston');
require('winston-daily-rotate-file');
const config = require('../config');
const { getContext } = require('./context');
const { AmqpLogTransport } = require('./amqp-log-transport');

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'authorization',
  'accesstoken',
  'token',
  'x-callback-token',
]);
const MAX_REDACTION_DEPTH = 6;

function redact(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > MAX_REDACTION_DEPTH) return value;
  if (value instanceof Error) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(inner, depth + 1),
    ]),
  );
}

const redactSensitive = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) info[key] = '[REDACTED]';
    else if (typeof info[key] === 'object') info[key] = redact(info[key]);
  }
  return info;
});

const addContext = winston.format((info) => {
  const { requestId, userId } = getContext();
  if (requestId && !info.requestId) info.requestId = requestId;
  if (userId && !info.userId) info.userId = userId;
  return info;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  addContext(),
  redactSensitive(),
);

const prettyConsole = winston.format.combine(
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, requestId, service, env, stack, ...meta }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} ${level}${rid} ${message}${extra}${stack ? `\n${stack}` : ''}`;
  }),
);

const transports = [
  new winston.transports.Console({
    silent: config.isTest,
    format: config.env === 'development' ? prettyConsole : winston.format.json(),
  }),
];

if (config.logging.toFile) {
  const rotation = { dirname: config.logging.dir, datePattern: 'YYYY-MM-DD', maxSize: '20m', maxFiles: '14d' };
  transports.push(
    new winston.transports.DailyRotateFile({ ...rotation, filename: 'app-%DATE%.log' }),
    new winston.transports.DailyRotateFile({ ...rotation, filename: 'error-%DATE%.log', level: 'error' }),
  );
}

if (config.logging.shipToBroker) {
  transports.push(new AmqpLogTransport({ url: config.broker.url, service: config.serviceName }));
}

const logger = winston.createLogger({
  level: config.logging.level,
  defaultMeta: { service: config.serviceName, env: config.env },
  format: winston.format.combine(baseFormat, winston.format.json()),
  transports,
  exitOnError: false,
});

module.exports = logger;
module.exports.redact = redact;
