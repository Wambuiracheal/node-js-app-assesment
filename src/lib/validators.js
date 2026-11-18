'use strict';

const { z } = require('zod');
const { hasAtMostTwoDecimals } = require('./money');
const { isValidAccountNumber, normalizeKenyanPhone } = require('./identifiers');

// Validation schemas for request payloads and query parameters. These are used in route handlers to validate incoming requests.
const amount = ({ min = 0.01, max }) =>
  z
    .number({ required_error: 'amount is required', invalid_type_error: 'amount must be a number' })
    .min(min, `amount must be at least ${min}`)
    .max(max, `amount must not exceed ${max}`)
    .refine(hasAtMostTwoDecimals, 'amount must have at most 2 decimal places');

// Validates that a string is a valid 14-digit account number with a correct Luhn check digit.
const accountNumber = (label = 'accountNumber') =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be a string` })
    .trim()
    .refine(isValidAccountNumber, `${label} must be a valid 14-digit account number`);

// Validates that a string is a valid Kenyan phone number.
const phoneNumber = z
  .string({ required_error: 'phoneNumber is required' })
  .transform((value, ctx) => {
    const normalized = normalizeKenyanPhone(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'phoneNumber must be a valid Kenyan mobile number, e.g. 0712345678 or 254712345678',
      });
      return z.NEVER;
    }
    return normalized;
  });

const narration = z.string().trim().max(140, 'narration must be at most 140 characters').optional();

const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

module.exports = { amount, accountNumber, phoneNumber, narration, pagination };
