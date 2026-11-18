'use strict';

require('dotenv').config({ quiet: true });
const { z } = require('zod');

// Helper function to parse boolean flags from environment variables.
const flag = (defaultValue) =>
  z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value === 'true'));

// Define the schema for environment variables using Zod.
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default('*'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_ISSUER: z.string().default('banking-payments-api'),
  JWT_AUDIENCE: z.string().default('banking-payments-clients'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),

  BROKER: z.enum(['rabbitmq', 'memory']).default('rabbitmq'),
  RABBITMQ_URL: z.string().default('amqp://guest:guest@localhost:5672'),
  RUN_CONSUMERS: flag(true),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  LOG_DIR: z.string().default('logs'),
  LOG_TO_FILE: flag(true),
  LOG_SHIP_TO_BROKER: flag(true),

  MPESA_SHORTCODE: z.string().default('174379'),
  MPESA_CALLBACK_URL: z.string().url().default('http://localhost:3000/api/v1/mpesa/callback'),
  MPESA_CALLBACK_TOKEN: z.string().min(16, 'MPESA_CALLBACK_TOKEN must be at least 16 characters long'),
  MPESA_MOCK_AUTO_CALLBACK: flag(true),
  MPESA_MOCK_CALLBACK_DELAY_MS: z.coerce.number().int().min(0).default(3000),
  MPESA_MIN_AMOUNT: z.coerce.number().positive().default(1),
  MPESA_MAX_AMOUNT: z.coerce.number().positive().default(250000),

  TRANSFER_MAX_AMOUNT: z.coerce.number().positive().default(1000000),
  MAX_ACCOUNTS_PER_CUSTOMER: z.coerce.number().int().positive().default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`);
  
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`);
  throw new Error('Invalid environment configuration');
}

const env = parsed.data;

const config = Object.freeze({
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  corsOrigin: env.CORS_ORIGIN,
  serviceName: 'banking-payments-api',

  db: { url: env.DATABASE_URL, poolMax: env.DB_POOL_MAX },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtIssuer: env.JWT_ISSUER,
    jwtAudience: env.JWT_AUDIENCE,
    bcryptRounds: env.BCRYPT_ROUNDS,
    rateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  },

  broker: { type: env.BROKER, url: env.RABBITMQ_URL, runConsumers: env.RUN_CONSUMERS },

  logging: {
    level: env.LOG_LEVEL,
    dir: env.LOG_DIR,
    toFile: env.LOG_TO_FILE,
    shipToBroker: env.LOG_SHIP_TO_BROKER,
  },

  mpesa: {
    shortCode: env.MPESA_SHORTCODE,
    callbackUrl: env.MPESA_CALLBACK_URL,
    callbackToken: env.MPESA_CALLBACK_TOKEN,
    autoCallback: env.MPESA_MOCK_AUTO_CALLBACK,
    callbackDelayMs: env.MPESA_MOCK_CALLBACK_DELAY_MS,
    minAmount: env.MPESA_MIN_AMOUNT,
    maxAmount: env.MPESA_MAX_AMOUNT,
  },

  limits: {
    maxTransferAmount: env.TRANSFER_MAX_AMOUNT,
    maxAccountsPerCustomer: env.MAX_ACCOUNTS_PER_CUSTOMER,
  },
});

module.exports = config;
