'use strict';

const config = require('./config');
const logger = require('./lib/logger');
const { createDb } = require('./db');
const { createApp } = require('./app');
const { createBroker } = require('./messaging');
const { registerConsumers } = require('./messaging/consumers');
const { createMockMpesaClient } = require('./modules/mpesa/mpesa.mock-client');

const SHUTDOWN_TIMEOUT_MS = 10_000;

// initialize db, messaging broker, and start the express server
async function main() {
  const db = createDb(config.db);
  await db.raw('select 1');
  logger.info('Connected to PostgreSQL');

  const broker = createBroker(config.broker, logger);
  await broker.connect();

  const mpesaClient = createMockMpesaClient({ config: config.mpesa, logger });
  const { app, services } = createApp({ db, broker, mpesaClient });

  if (config.broker.runConsumers) await registerConsumers({ broker, services });

  const server = app.listen(config.port, () => {
    logger.info(`Payments API listening on port ${config.port}`, { docs: `http://localhost:${config.port}/docs` });
  });

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`);
    setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();

    server.close(async () => {
      await broker.close();
      await db.destroy();
      logger.info('Shutdown complete');
      setTimeout(() => process.exit(0), 200); // let the final log lines reach file and broker
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => logger.error('Unhandled promise rejection', { error: String(reason) }));

main().catch((error) => {
  logger.error('Failed to start application', { error: error.message, stack: error.stack });
  setTimeout(() => process.exit(1), 100);
});
