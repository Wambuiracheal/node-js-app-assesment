'use strict';

const { createRabbitMqBroker } = require('./rabbitmq.broker');
const { createMemoryBroker } = require('./memory.broker');

function createBroker({ type, url }, logger) {
  return type === 'memory' ? createMemoryBroker({ logger }) : createRabbitMqBroker({ url, logger });
}


function createEventPublisher(broker, logger) {
  return {
    async publish(routingKey, payload) {
      try {
        await broker.publish(routingKey, payload);
      } catch (error) {
        logger.error('Failed to publish domain event', { routingKey, error: error.message });
      }
    },
  };
}

module.exports = { createBroker, createEventPublisher };
