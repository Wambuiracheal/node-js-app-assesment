'use strict';

const { randomUUID } = require('node:crypto');
const amqp = require('amqplib');
const { getContext, runWithContext } = require('../lib/context');
const { EXCHANGE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE } = require('./topology');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


function createRabbitMqBroker({ url, logger, prefetch = 10 }) {
  let connection;
  let channel;
  let healthy = false;

  async function connect({ retries = 15, delayMs = 2000 } = {}) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        connection = await amqp.connect(url);
        break;
      } catch (error) {
        if (attempt >= retries) throw error;
        logger.warn('RabbitMQ not reachable yet, retrying', { attempt, retries, error: error.message });
        await sleep(delayMs);
      }
    }

    connection.on('error', (error) => logger.error('RabbitMQ connection error', { error: error.message }));
    connection.on('close', () => {
      healthy = false;
      logger.warn('RabbitMQ connection closed');
    });

    channel = await connection.createConfirmChannel();
    channel.on('error', (error) => logger.error('RabbitMQ channel error', { error: error.message }));
    await channel.prefetch(prefetch);

    await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
    await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true });
    await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true });
    await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '');

    healthy = true;
    logger.info('Connected to RabbitMQ', { exchange: EXCHANGE });
  }

  function publish(routingKey, payload, { correlationId } = {}) {
    const body = Buffer.from(JSON.stringify(payload));
    const options = {
      persistent: true,
      contentType: 'application/json',
      messageId: randomUUID(),
      correlationId: correlationId || getContext().requestId,
      timestamp: Math.floor(Date.now() / 1000),
      type: routingKey,
    };

    return new Promise((resolve, reject) => {
      channel.publish(EXCHANGE, routingKey, body, options, (error) => (error ? reject(error) : resolve()));
    }).then(() => logger.debug('Message published', { routingKey, messageId: options.messageId }));
  }

  async function subscribe({ name, bindings }, handler) {
    await channel.assertQueue(name, { durable: true, deadLetterExchange: DEAD_LETTER_EXCHANGE });
    for (const key of bindings) await channel.bindQueue(name, EXCHANGE, key);

    await channel.consume(name, (message) => {
      if (!message) return;
      const correlationId = message.properties.correlationId || randomUUID();
      const meta = { queue: name, routingKey: message.fields.routingKey, messageId: message.properties.messageId };

      runWithContext({ requestId: correlationId }, async () => {
        try {
          await handler(JSON.parse(message.content.toString()), meta);
          channel.ack(message);
        } catch (error) {
          // No infinite redelivery loops: failed messages go to the dead-letter queue.
          logger.error('Message processing failed; dead-lettering', { ...meta, error: error.message, stack: error.stack });
          channel.nack(message, false, false);
        }
      });
    });

    logger.info('Consumer subscribed', { queue: name, bindings });
  }

  async function close() {
    healthy = false;
    await channel?.close().catch(() => {});
    await connection?.close().catch(() => {});
  }

  return { connect, publish, subscribe, close, isHealthy: async () => healthy };
}

module.exports = { createRabbitMqBroker };
