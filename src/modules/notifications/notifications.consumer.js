'use strict';

const logger = require('../../lib/logger');
const { RoutingKeys } = require('../../messaging/topology');


const templates = {
  [RoutingKeys.TRANSFER_COMPLETED]: (e) => [
    {
      recipientUserId: e.sourceUserId,
      text: `${e.reference} Confirmed. ${e.amount.formatted} sent from ${e.sourceAccount} to ${e.destinationAccount}. New balance: ${e.sourceBalance.formatted}.`,
    },
    {
      recipientUserId: e.destinationUserId,
      text: `${e.reference} Confirmed. You have received ${e.amount.formatted} from ${e.sourceAccount} into ${e.destinationAccount}.`,
    },
  ],
  [RoutingKeys.DEPOSIT_COMPLETED]: (e) => [
    {
      recipientUserId: e.userId,
      text: `${e.receipt} Confirmed. ${e.amount.formatted} deposited from M-Pesa ${e.phone} to account ${e.accountNumber}. New balance: ${e.balance.formatted}.`,
    },
  ],
  [RoutingKeys.DEPOSIT_FAILED]: (e) => [
    { recipientPhone: e.phone, text: `Your M-Pesa deposit of ${e.amount.formatted} was not completed: ${e.reason}.` },
  ],
};

async function handleNotification(event, { routingKey }) {
  const build = templates[routingKey];
  if (!build) {
    logger.warn('No notification template for event', { routingKey });
    return;
  }
  for (const notification of build(event)) {
    logger.info('Notification dispatched', { channel: 'SMS', event: routingKey, ...notification });
  }
}

module.exports = { handleNotification };
