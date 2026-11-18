'use strict';

const { getContext, runWithContext } = require('../lib/context');


function topicToRegExp(pattern) {
  const source = pattern
    .split('.')
    .map((word) => {
      if (word === '#') return '.*';
      if (word === '*') return '[^.]+';
      return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('\\.');
  return new RegExp(`^${source}$`);
}


function createMemoryBroker({ logger }) {
  const subscriptions = [];
  const pending = new Set();
  const published = [];
  const deadLetters = [];

  async function publish(routingKey, payload, { correlationId } = {}) {
    const message = structuredClone(payload);
    const requestId = correlationId || getContext().requestId;
    published.push({ routingKey, payload: message });

    for (const { name, patterns, handler } of subscriptions) {
      if (!patterns.some((re) => re.test(routingKey))) continue;

      const delivery = new Promise((resolve) => setImmediate(resolve))
        .then(() => runWithContext({ requestId }, () => handler(structuredClone(message), { queue: name, routingKey })))
        .catch((error) => {
          logger.error('Message processing failed; dead-lettering', { queue: name, routingKey, error: error.message });
          deadLetters.push({ queue: name, routingKey, payload: message, error: error.message });
        })
        .finally(() => pending.delete(delivery));
      pending.add(delivery);
    }
  }

  async function subscribe({ name, bindings }, handler) {
    subscriptions.push({ name, patterns: bindings.map(topicToRegExp), handler });
  }

  async function drain() {
    while (pending.size) await Promise.all([...pending]);
  }

  return {
    connect: async () => {},
    close: async () => {},
    isHealthy: async () => true,
    publish,
    subscribe,
    drain,
    published,
    deadLetters,
  };
}

module.exports = { createMemoryBroker, topicToRegExp };
