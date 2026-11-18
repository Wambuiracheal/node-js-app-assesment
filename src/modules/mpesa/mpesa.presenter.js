'use strict';

const { moneyView } = require('../../lib/money');
const { maskPhone } = require('../../lib/identifiers');

const toDepositDto = (request, extra = {}) => ({
  checkoutRequestId: request.checkout_request_id,
  merchantRequestId: request.merchant_request_id,
  accountNumber: request.account_number,
  phoneNumber: maskPhone(request.phone_number),
  amount: moneyView(request.amount_cents, request.currency ?? 'KES'),
  status: request.status,
  resultCode: request.result_code,
  resultDescription: request.result_desc,
  mpesaReceiptNumber: request.mpesa_receipt_number,
  transactionDate: request.transaction_date,
  createdAt: request.created_at,
  ...extra,
});

module.exports = { toDepositDto };
