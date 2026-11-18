'use strict';

const { z } = require('zod');
const config = require('../../config');
const validators = require('../../lib/validators');

// Transfer creation request body schema
const createTransfer = z
  .object({
    sourceAccountNumber: validators.accountNumber('sourceAccountNumber'),
    destinationAccountNumber: validators.accountNumber('destinationAccountNumber'),
    amount: validators.amount({ max: config.limits.maxTransferAmount }),
    narration: validators.narration,
  })
  .strict()
  .refine((body) => body.sourceAccountNumber !== body.destinationAccountNumber, {
    message: 'destinationAccountNumber must be different from sourceAccountNumber',
    path: ['destinationAccountNumber'],
  });

//create a transfer after a timeout. 
const transferHeaders = z.object({
  'idempotency-key': z
    .string()
    .trim()
    .regex(/^[\w-]{8,64}$/, 'Idempotency-Key must be 8-64 characters of letters, digits, "-" or "_"')
    .optional(),
});

// Transfer reference parameter schema
const transferParams = z.object({
  reference: z.string().trim().regex(/^TRF[0-9A-Z]{14}$/, 'reference must be a valid transfer reference'),
});

module.exports = { createTransfer, transferHeaders, transferParams };
