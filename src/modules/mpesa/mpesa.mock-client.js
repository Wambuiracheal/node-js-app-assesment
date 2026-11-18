'use strict';

/**
 * Mocked Safaricom Daraja "Lipa na M-Pesa Online" (STK push) client.
 *
 * Mirrors the real integration's shape so swapping in a live client only
 * touches this file:
 *   1. stkPush() returns Daraja's synchronous acknowledgement
 *      (MerchantRequestID / CheckoutRequestID / ResponseCode).
 *   2. Some seconds later "Safaricom" POSTs the result to our callback URL,
 *      using Daraja's exact callback payload format.
 *
 * Deterministic test phone numbers simulate failure outcomes:
 *   254700000001 -> 1032 Request cancelled by user
 *   254700000002 -> 1    Insufficient M-Pesa balance
 *   254700000003 -> 1037 Customer phone unreachable
 * Any other number succeeds.
 */
const crypto = require('node:crypto');
const { randomString } = require('../../lib/identifiers');

const SIMULATED_FAILURES = Object.freeze({
  254700000001: { code: 1032, description: 'Request cancelled by user' },
  254700000002: { code: 1, description: 'The balance is insufficient for the transaction' },
  254700000003: { code: 1037, description: 'DS timeout user cannot be reached' },
});

/** Daraja timestamps are yyyyMMddHHmmss in East Africa Time. */
function darajaTimestamp(date = new Date()) {
  const eat = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  return Number(eat.toISOString().replace(/[-:T]/g, '').slice(0, 14));
}

function createMockMpesaClient({ config, logger, deliver = postCallback(config) }) {
  const requests = new Map();

  function buildCallback(checkoutRequestId) {
    const request = requests.get(checkoutRequestId);
    if (!request) throw new Error(`Unknown CheckoutRequestID ${checkoutRequestId}`);

    const failure = SIMULATED_FAILURES[request.phoneNumber];
    const stkCallback = {
      MerchantRequestID: request.merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResultCode: failure ? failure.code : 0,
      ResultDesc: failure ? failure.description : 'The service request is processed successfully.',
    };

    if (!failure) {
      stkCallback.CallbackMetadata = {
        Item: [
          { Name: 'Amount', Value: request.amount },
          { Name: 'MpesaReceiptNumber', Value: `T${randomString(9, 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789')}` },
          { Name: 'Balance' },
          { Name: 'TransactionDate', Value: darajaTimestamp() },
          { Name: 'PhoneNumber', Value: Number(request.phoneNumber) },
        ],
      };
    }

    return { Body: { stkCallback } };
  }

  async function stkPush({ phoneNumber, amount, accountReference, transactionDesc }) {
    const merchantRequestId = `${crypto.randomInt(10000, 99999)}-${crypto.randomInt(1e6, 9e6)}-1`;
    const checkoutRequestId = `ws_CO_${darajaTimestamp()}${crypto.randomInt(1e8, 9e8)}`;
    requests.set(checkoutRequestId, { merchantRequestId, phoneNumber, amount, accountReference, transactionDesc });

    logger.info('[mock M-Pesa] STK push accepted', { checkoutRequestId, accountReference });

    if (config.autoCallback) {
      setTimeout(() => {
        deliver(buildCallback(checkoutRequestId))
          .then(() => logger.info('[mock M-Pesa] Callback delivered', { checkoutRequestId }))
          .catch((error) => logger.error('[mock M-Pesa] Callback delivery failed', { checkoutRequestId, error: error.message }))
          .finally(() => requests.delete(checkoutRequestId));
      }, config.callbackDelayMs).unref();
    }

    return {
      MerchantRequestID: merchantRequestId,
      CheckoutRequestID: checkoutRequestId,
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing',
    };
  }

  return { stkPush, buildCallback };
}

/** Default delivery: an HTTP POST to our own callback endpoint, exactly as Safaricom would. */
function postCallback(config) {
  return async (payload) => {
    const response = await fetch(config.callbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Callback-Token': config.callbackToken },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Callback endpoint responded with HTTP ${response.status}`);
  };
}

module.exports = { createMockMpesaClient, SIMULATED_FAILURES };
