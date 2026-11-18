'use strict';

const { moneyView } = require('../../lib/money');

const toAccountDto = (account) => ({
  accountNumber: account.account_number,
  accountName: account.account_name,
  currency: account.currency,
  status: account.status,
  balance: moneyView(account.balance_cents, account.currency),
  openedAt: account.created_at,
});

// Balance enquiry response — formatted for direct display in a client app. 
const toBalanceDto = (account) => ({
  accountNumber: account.account_number,
  accountName: account.account_name,
  status: account.status,
  availableBalance: moneyView(account.balance_cents, account.currency),
  asAt: new Date().toISOString(),
});

module.exports = { toAccountDto, toBalanceDto };
