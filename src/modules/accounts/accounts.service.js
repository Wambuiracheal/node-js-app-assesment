'use strict';

const config = require('../../config');
const logger = require('../../lib/logger');
const { Errors, isUniqueViolation } = require('../../lib/errors');
const { generateAccountNumber } = require('../../lib/identifiers');
const accountsRepository = require('./accounts.repository');
const usersRepository = require('../auth/users.repository');
const transactionsRepository = require('../transactions/transactions.repository');
const { toAccountDto, toBalanceDto } = require('./accounts.presenter');
const { toTransactionDto } = require('../transactions/transactions.presenter');

const MAX_ACCOUNT_NUMBER_ATTEMPTS = 5;

/** Throws unless the account can send/receive money. */
function assertActive(account, label = 'Account') {
  if (account.status !== 'ACTIVE') {
    throw Errors.businessRule('ACCOUNT_NOT_ACTIVE', `${label} account is ${account.status.toLowerCase()}`);
  }
}

function createAccountsService({ db }) {

  async function getAccessibleAccount(user, accountNumber, { trx = db } = {}) {
    const account = await accountsRepository.findByNumber(trx, accountNumber);
    if (!account || (account.user_id !== user.id && user.role !== 'ADMIN')) throw Errors.notFound('Account');
    return account;
  }

  async function openAccount(user, { accountName }, trx = db) {
    const existing = await accountsRepository.countByUser(trx, user.id);
    if (existing >= config.limits.maxAccountsPerCustomer) {
      throw Errors.businessRule(
        'ACCOUNT_LIMIT_REACHED',
        `A customer may hold at most ${config.limits.maxAccountsPerCustomer} accounts`,
      );
    }

    for (let attempt = 1; attempt <= MAX_ACCOUNT_NUMBER_ATTEMPTS; attempt += 1) {
      try {
        // Savepoint, so a collision doesn't abort an enclosing transaction (e.g. registration).
        const account = await trx.transaction((sp) =>
          accountsRepository.create(sp, {
            account_number: generateAccountNumber(),
            user_id: user.id,
            account_name: accountName ?? `${user.full_name} - Account ${existing + 1}`,
          }),
        );
        logger.info('Account opened', { userId: user.id, accountNumber: account.account_number });
        return account;
      } catch (error) {
        if (!isUniqueViolation(error, 'accounts_account_number_unique')) throw error;
        logger.warn('Account number collision, regenerating', { attempt });
      }
    }
    throw new Error('Could not allocate a unique account number');
  }

  return {
    assertActive,
    getAccessibleAccount,
    openAccount,

    async open(user, input) {
      const owner = await usersRepository.findById(db, user.id);
      return toAccountDto(await openAccount(owner, input));
    },

    async list(user) {
      return (await accountsRepository.listByUser(db, user.id)).map(toAccountDto);
    },

    async get(user, accountNumber) {
      return toAccountDto(await getAccessibleAccount(user, accountNumber));
    },

    async getBalance(user, accountNumber) {
      const account = await getAccessibleAccount(user, accountNumber);
      logger.info('Balance enquiry', { accountNumber });
      return toBalanceDto(account);
    },

    async getStatement(user, accountNumber, { page, limit, type }) {
      const account = await getAccessibleAccount(user, accountNumber);
      const { rows, total } = await transactionsRepository.listByAccount(db, account.id, { page, limit, type });
      return {
        data: rows.map(toTransactionDto),
        meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
      };
    },
  };
}

module.exports = { createAccountsService, assertActive };
