'use strict';

const logger = require('../lib/logger');
const { Queues } = require('./topology');
const { stkCallback } = require('../modules/mpesa/mpesa.schemas');
const { handleNotification } = require('../modules/notifications/notifications.consumer');

//connect queues to their consumers
async function registerConsumers({ broker, services }) {
  await broker.subscribe(Queues.MPESA_CALLBACKS, async (payload) => {
   
    const parsed = stkCallback.parse(payload);
    await services.mpesaService.processCallback(parsed);
  });

  await broker.subscribe(Queues.NOTIFICATIONS, handleNotification);

  logger.info('Message consumers registered');
}

module.exports = { registerConsumers };
