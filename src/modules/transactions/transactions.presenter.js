'use strict';

const { moneyView } = require('../../lib/money');

const toTransactionDto = (entry) => ({
  id: entry.id,
  reference: entry.reference,
  type: entry.entry_type,
  channel: entry.channel,
  amount: moneyView(entry.amount_cents, entry.currency),
  balanceAfter: moneyView(entry.balance_after_cents, entry.currency),
  narration: entry.narration,
  counterparty: entry.counterparty,
  externalReference: entry.external_reference,
  createdAt: entry.created_at,
});

module.exports = { toTransactionDto };
