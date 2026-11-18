'use strict';

const EXCHANGE = 'banking.events';
const DEAD_LETTER_EXCHANGE = 'banking.dlx';
const DEAD_LETTER_QUEUE = 'banking.dead-letter';

const RoutingKeys = Object.freeze({
  MPESA_CALLBACK_RECEIVED: 'mpesa.callback.received',
  TRANSFER_COMPLETED: 'transfer.completed',
  DEPOSIT_COMPLETED: 'deposit.completed',
  DEPOSIT_FAILED: 'deposit.failed',
});

const Queues = Object.freeze({
  MPESA_CALLBACKS: {
    name: 'banking.mpesa-callbacks',
    bindings: [RoutingKeys.MPESA_CALLBACK_RECEIVED],
  },
 
  NOTIFICATIONS: {
    name: 'banking.notifications',
    bindings: [RoutingKeys.TRANSFER_COMPLETED, 'deposit.*'],
  },
});

const LOG_EXCHANGE = 'banking.logs';
const LOG_QUEUE = Object.freeze({
  name: 'banking.logs.aggregator',
  bindings: ['logs.#'],
  options: { durable: true, arguments: { 'x-max-length': 100000, 'x-overflow': 'drop-head' } },
});

module.exports = { EXCHANGE, DEAD_LETTER_EXCHANGE, DEAD_LETTER_QUEUE, RoutingKeys, Queues, LOG_EXCHANGE, LOG_QUEUE };
