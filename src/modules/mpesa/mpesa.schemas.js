'use strict';

const { z } = require('zod');
const config = require('../../config');
const validators = require('../../lib/validators');

const initiateDeposit = z
  .object({
    accountNumber: validators.accountNumber(),
    phoneNumber: validators.phoneNumber,
    // M-Pesa only moves whole shillings.
    amount: validators
      .amount({ min: config.mpesa.minAmount, max: config.mpesa.maxAmount })
      .refine(Number.isInteger, 'M-Pesa amounts must be whole shillings'),
  })
  .strict();

const depositParams = z.object({
  checkoutRequestId: z.string().trim().regex(/^ws_CO_\w{10,40}$/, 'checkoutRequestId is not valid'),
});

/** Daraja STK push result callback. Successful results must carry the payment metadata. */
const stkCallback = z
  .object({
    Body: z.object({
      stkCallback: z.object({
        MerchantRequestID: z.string().min(1),
        CheckoutRequestID: z.string().min(1),
        ResultCode: z.coerce.number().int(),
        ResultDesc: z.string(),
        CallbackMetadata: z
          .object({
            Item: z.array(z.object({ Name: z.string(), Value: z.union([z.string(), z.number()]).optional() })),
          })
          .optional(),
      }),
    }),
  })
  .superRefine(({ Body: { stkCallback: cb } }, ctx) => {
    if (cb.ResultCode !== 0) return;
    const names = new Set((cb.CallbackMetadata?.Item ?? []).filter((i) => i.Value !== undefined).map((i) => i.Name));
    for (const required of ['Amount', 'MpesaReceiptNumber', 'PhoneNumber']) {
      if (!names.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['Body', 'stkCallback', 'CallbackMetadata'],
          message: `${required} is required for a successful payment`,
        });
      }
    }
  });

module.exports = { initiateDeposit, depositParams, stkCallback };
