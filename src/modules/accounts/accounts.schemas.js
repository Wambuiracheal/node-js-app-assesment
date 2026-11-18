'use strict';

const { z } = require('zod');
const { accountNumber, pagination } = require('../../lib/validators');

const openAccount = z
  .object({
    accountName: z.string().trim().min(3, 'accountName must be at least 3 characters').max(80).optional(),
  })
  .strict();

const accountParams = z.object({ accountNumber: accountNumber() });

const statementQuery = pagination.extend({
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
});

module.exports = { openAccount, accountParams, statementQuery };
