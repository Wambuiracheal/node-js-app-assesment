'use strict';

// Aggregates logs from RabbitMQ and writes them to daily files, splitting errors into a separate file.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const amqp = require('amqplib');
const { LOG_EXCHANGE, LOG_QUEUE } = require('./messaging/topology');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Creates a writable stream that writes to a daily file, rotating at midnight. The file is created if it doesn't exist.
function createDailyFileWriter(directory, prefix) {
  fs.mkdirSync(directory, { recursive: true });
  let currentDay;
  let stream;

  return {
    write(line, now = new Date()) {
      const day = now.toISOString().slice(0, 10);
      if (day !== currentDay) {
        stream?.end();
        stream = fs.createWriteStream(path.join(directory, `${prefix}-${day}.log`), { flags: 'a' });
        currentDay = day;
      }
      stream.write(`${line}\n`);
    },
    close: () => new Promise((resolve) => (stream ? stream.end(resolve) : resolve())),
  };
}

// Creates a log sink that writes all logs to one file and errors to another, keeping stats of received and error lines.
function createLogSink(directory) {
  const all = createDailyFileWriter(directory, 'aggregated');
  const errors = createDailyFileWriter(directory, 'errors');
  const stats = { received: 0, errors: 0 };

  return {
    stats,
    handle(content, routingKey = '') {
      const line = content.toString().trim();
      if (!line) return;
      stats.received += 1;
      all.write(line);

      const level = routingKey.split('.').pop();
      if (level === 'error') {
        stats.errors += 1;
        errors.write(line);
      }
    },
    close: () => Promise.all([all.close(), errors.close()]),
  };
}

// Connects to RabbitMQ with retries, logging each failed attempt, and returns the connection.
async function connectWithRetry(url, retries = 30, delayMs = 2000) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await amqp.connect(url);
    } catch (error) {
      if (attempt >= retries) throw error;
      console.warn(`[log-aggregator] RabbitMQ not reachable (attempt ${attempt}/${retries}): ${error.message}`);
      await sleep(delayMs);
    }
  }
}

// Main function that connects to RabbitMQ, sets up the log sink, and starts consuming log messages.
async function main() {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  const directory = process.env.AGGREGATED_LOG_DIR || 'aggregated-logs';
  const sink = createLogSink(directory);

  const connection = await connectWithRetry(url);
  // Exit on connection loss; the container orchestrator restarts us (restart: unless-stopped).
  connection.on('close', () => {
    console.error('[log-aggregator] RabbitMQ connection lost, exiting');
    process.exit(1);
  });

  const channel = await connection.createChannel();
  await channel.assertExchange(LOG_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(LOG_QUEUE.name, LOG_QUEUE.options);
  for (const key of LOG_QUEUE.bindings) await channel.bindQueue(LOG_QUEUE.name, LOG_EXCHANGE, key);
  await channel.prefetch(200);

  await channel.consume(LOG_QUEUE.name, (message) => {
    if (!message) return;
    sink.handle(message.content, message.fields.routingKey);
    channel.ack(message);
  });

  console.log(`[log-aggregator] Consuming "${LOG_QUEUE.name}" -> ${path.resolve(directory)}`);
  setInterval(() => {
    console.log(`[log-aggregator] lines received: ${sink.stats.received}, errors: ${sink.stats.errors}`);
  }, 60_000).unref();

  const shutdown = async () => {
    await channel.close().catch(() => {});
    connection.removeAllListeners('close');
    await connection.close().catch(() => {});
    await sink.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// If this script is run directly, execute the main function and handle any errors by logging and exiting.
if (require.main === module) {
  main().catch((error) => {
    console.error(`[log-aggregator] Failed to start: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { createDailyFileWriter, createLogSink };
