'use strict';

const { moneyView } = require('../../lib/money');
const { maskAccountNumber } = require('../../lib/identifiers');

//transfer presenter: converts toAPI response format
const toTransferDto = (transfer, viewer) => {
  const ownsDestination = viewer && transfer.destination_user_id === viewer.id;
  const ownsSource = viewer && transfer.source_user_id === viewer.id;
  const isAdmin = viewer?.role === 'ADMIN';

  return {
    reference: transfer.reference,
    status: transfer.status,
    amount: moneyView(transfer.amount_cents, transfer.currency),
    sourceAccount: ownsSource || isAdmin ? transfer.source_account_number : maskAccountNumber(transfer.source_account_number),
    destinationAccount:
      ownsDestination || isAdmin
        ? transfer.destination_account_number
        : maskAccountNumber(transfer.destination_account_number),
    destinationAccountName: transfer.destination_account_name,
    narration: transfer.narration,
    createdAt: transfer.created_at,
  };
};

module.exports = { toTransferDto };
