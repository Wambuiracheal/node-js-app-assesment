'use strict';

const logger = require('../../lib/logger');
const { Errors, isUniqueViolation } = require('../../lib/errors');
const { toMinorUnits, moneyView } = require('../../lib/money');
const { maskPhone } = require('../../lib/identifiers');
const { RoutingKeys } = require('../../messaging/topology');
const accountsRepository = require('../accounts/accounts.repository');
const transactionsRepository = require('../transactions/transactions.repository');
const mpesaRepository = require('./mpesa.repository');
const { toDepositDto } = require('./mpesa.presenter');

const metadataValue = (callback, name) =>
  callback.CallbackMetadata?.Item?.find((item) => item.Name === name)?.Value;

/** Daraja yyyyMMddHHmmss (EAT) -> Date */
function parseDarajaDate(value) {
  const match = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  return match ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+03:00`) : new Date();
}

/**
 * Customer M-Pesa deposits (C2B via STK push):
 *
 *   POST /mpesa/deposits ─► mpesa.stkPush() ─► mpesa_requests (PENDING) ─► 202 Accepted
 *   Safaricom ─► POST /mpesa/callback ─► queue "mpesa.callback.received" ─► 200 ack (fast)
 *   consumer ─► processCallback(): credit account + ledger entry, request COMPLETED/FAILED
 *            ─► event deposit.completed / deposit.failed ─► notifications
 */
function createMpesaService({ db, broker, events, mpesaClient, accountsService }) {
  async function initiateDeposit(user, { accountNumber, phoneNumber, amount }) {
    const account = await accountsService.getAccessibleAccount(user, accountNumber);
    accountsService.assertActive(account);

    let response;
    try {
      response = await mpesaClient.stkPush({
        phoneNumber,
        amount,
        accountReference: accountNumber,
        transactionDesc: 'Account deposit',
      });
    } catch (error) {
      logger.error('M-Pesa STK push failed', { error: error.message });
      throw Errors.badGateway('MPESA_UNAVAILABLE', 'M-Pesa is currently unavailable, please try again shortly');
    }
    if (response.ResponseCode !== '0') {
      throw Errors.badGateway('MPESA_REQUEST_REJECTED', response.ResponseDescription ?? 'M-Pesa rejected the request');
    }

    const request = await mpesaRepository.create(db, {
      merchant_request_id: response.MerchantRequestID,
      checkout_request_id: response.CheckoutRequestID,
      account_id: account.id,
      initiated_by: user.id,
      phone_number: phoneNumber,
      amount_cents: toMinorUnits(amount),
      status: 'PENDING',
    });

    logger.info('M-Pesa deposit initiated', {
      checkoutRequestId: request.checkout_request_id,
      accountNumber,
      phone: maskPhone(phoneNumber),
      amount,
    });

    return toDepositDto(
      { ...request, account_number: account.account_number, currency: account.currency },
      { customerMessage: `Enter your M-Pesa PIN on ${maskPhone(phoneNumber)} to complete the deposit` },
    );
  }

  async function getDeposit(user, checkoutRequestId) {
    const request = await mpesaRepository.findByCheckoutRequestId(db, checkoutRequestId);
    if (!request || (request.account_user_id !== user.id && user.role !== 'ADMIN')) throw Errors.notFound('Deposit');
    return toDepositDto(request);
  }

  /** Acknowledge Safaricom quickly; the heavy lifting happens asynchronously off the queue. */
  async function acceptCallback(payload) {
    const { CheckoutRequestID, ResultCode } = payload.Body.stkCallback;
    try {
      await broker.publish(RoutingKeys.MPESA_CALLBACK_RECEIVED, payload);
    } catch (error) {
      logger.error('Could not enqueue M-Pesa callback', { checkoutRequestId: CheckoutRequestID, error: error.message });
      // Non-2xx makes Safaricom retry delivery later, so the payment isn't lost.
      throw Errors.serviceUnavailable('Callback could not be queued');
    }
    logger.info('M-Pesa callback queued', { checkoutRequestId: CheckoutRequestID, resultCode: ResultCode });
  }

  /** Queue consumer. Idempotent: replayed/duplicate callbacks never credit an account twice. */
  async function processCallback(payload) {
    const callback = payload.Body.stkCallback;
    const checkoutRequestId = callback.CheckoutRequestID;

    const outcome = await db.transaction(async (trx) => {
      const request = await mpesaRepository.lockByCheckoutRequestId(trx, checkoutRequestId);
      if (!request) throw new Error(`No M-Pesa request found for CheckoutRequestID ${checkoutRequestId}`);
      if (request.status !== 'PENDING') return { duplicate: true, request };

      if (callback.ResultCode !== 0) {
        const failed = await mpesaRepository.update(trx, request.id, {
          status: 'FAILED',
          result_code: callback.ResultCode,
          result_desc: callback.ResultDesc,
        });
        return { failed: true, request: failed };
      }

      const receipt = String(metadataValue(callback, 'MpesaReceiptNumber'));
      const paidCents = toMinorUnits(Number(metadataValue(callback, 'Amount')));
      if (paidCents !== request.amount_cents) {
        // Credit what the customer actually paid, but flag it for reconciliation.
        logger.warn('M-Pesa amount differs from requested amount', {
          checkoutRequestId,
          requestedCents: request.amount_cents,
          paidCents,
        });
      }

      const account = await accountsRepository.lockById(trx, request.account_id);
      const balanceAfter = account.balance_cents + paidCents;
      await accountsRepository.updateBalance(trx, account.id, balanceAfter);
      await transactionsRepository.insert(trx, {
        account_id: account.id,
        reference: receipt,
        entry_type: 'CREDIT',
        channel: 'MPESA',
        amount_cents: paidCents,
        balance_after_cents: balanceAfter,
        currency: account.currency,
        narration: 'M-Pesa deposit',
        counterparty: maskPhone(request.phone_number),
        external_reference: receipt,
        mpesa_request_id: request.id,
      });

      const completed = await mpesaRepository.update(trx, request.id, {
        status: 'COMPLETED',
        result_code: 0,
        result_desc: callback.ResultDesc,
        mpesa_receipt_number: receipt,
        transaction_date: parseDarajaDate(metadataValue(callback, 'TransactionDate')),
      });
      return { request: completed, account, paidCents, balanceAfter };
    }).catch((error) => {
      if (isUniqueViolation(error, 'mpesa_requests_mpesa_receipt_number_unique')) {
        logger.warn('Duplicate M-Pesa receipt ignored', { checkoutRequestId });
        return { duplicate: true };
      }
      throw error;
    });

    if (outcome.duplicate) {
      logger.info('Duplicate M-Pesa callback ignored', { checkoutRequestId });
      return;
    }

    if (outcome.failed) {
      logger.warn('M-Pesa deposit failed', { checkoutRequestId, resultCode: callback.ResultCode, reason: callback.ResultDesc });
      await events.publish(RoutingKeys.DEPOSIT_FAILED, {
        checkoutRequestId,
        phone: maskPhone(outcome.request.phone_number),
        amount: moneyView(outcome.request.amount_cents),
        reason: callback.ResultDesc,
      });
      return;
    }

    const { request, account, paidCents, balanceAfter } = outcome;
    logger.info('M-Pesa deposit completed', {
      checkoutRequestId,
      receipt: request.mpesa_receipt_number,
      accountNumber: account.account_number,
      amountCents: paidCents,
    });
    await events.publish(RoutingKeys.DEPOSIT_COMPLETED, {
      checkoutRequestId,
      receipt: request.mpesa_receipt_number,
      accountNumber: account.account_number,
      userId: account.user_id,
      phone: maskPhone(request.phone_number),
      amount: moneyView(paidCents, account.currency),
      balance: moneyView(balanceAfter, account.currency),
    });
  }

  return { initiateDeposit, getDeposit, acceptCallback, processCallback };
}

module.exports = { createMpesaService };
