'use strict';

const crypto = require('node:crypto');
const logger = require('../../lib/logger');
const { Errors, isUniqueViolation } = require('../../lib/errors');
const { toMinorUnits, moneyView } = require('../../lib/money');
const { generateReference, maskAccountNumber } = require('../../lib/identifiers');
const { RoutingKeys } = require('../../messaging/topology');
const accountsRepository = require('../accounts/accounts.repository');
const transactionsRepository = require('../transactions/transactions.repository');
const transfersRepository = require('./transfers.repository');
const { assertActive } = require('../accounts/accounts.service');
const { toTransferDto } = require('./transfers.presenter');

const hashRequest = (body) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify([body.sourceAccountNumber, body.destinationAccountNumber, body.amount, body.narration ?? null]))
    .digest('hex');

function createTransfersService({ db, events }) {
  // Returns the original result for a retried request, or rejects a reused key with a different payload. 
  async function replay(user, idempotencyKey, requestHash) {
    const existing = await transfersRepository.findByIdempotencyKey(db, user.id, idempotencyKey);
    if (!existing) return null;
    if (existing.request_hash !== requestHash) {
      throw Errors.businessRule(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different transfer request',
      );
    }
    logger.info('Idempotent transfer replayed', { reference: existing.reference });
    const source = await accountsRepository.findByNumber(db, existing.source_account_number);
    return { transfer: toTransferDto(existing, user), sourceBalance: moneyView(source.balance_cents, source.currency), replayed: true };
  }

 // Creates a new transfer, debiting the source account and crediting the destination account.
  async function transfer(user, body, idempotencyKey) {
    const { sourceAccountNumber, destinationAccountNumber, narration } = body;
    const amountCents = toMinorUnits(body.amount);
    const requestHash = hashRequest(body);

    if (idempotencyKey) {
      const previous = await replay(user, idempotencyKey, requestHash);
      if (previous) return previous;
    }

    let result;
    try {
      result = await db.transaction(async (trx) => {
        const locked = await accountsRepository.lockByNumbers(trx, [sourceAccountNumber, destinationAccountNumber]);
        const source = locked.find((a) => a.account_number === sourceAccountNumber);
        const destination = locked.find((a) => a.account_number === destinationAccountNumber);

        // Only the owner may debit an account — admins included.
        if (!source || source.user_id !== user.id) throw Errors.notFound('Source account');
        if (!destination) throw Errors.notFound('Destination account');
        assertActive(source, 'Source');
        assertActive(destination, 'Destination');
        if (source.currency !== destination.currency) {
          throw Errors.businessRule('CURRENCY_MISMATCH', 'Cross-currency transfers are not supported');
        }
        if (source.balance_cents < amountCents) {
          throw Errors.businessRule('INSUFFICIENT_FUNDS', 'Insufficient funds to complete this transfer', {
            available: moneyView(source.balance_cents, source.currency),
            requested: moneyView(amountCents, source.currency),
          });
        }

        const reference = generateReference('TRF');
        const sourceBalance = source.balance_cents - amountCents;
        const destinationBalance = destination.balance_cents + amountCents;

        const created = await transfersRepository.create(trx, {
          reference,
          initiated_by: user.id,
          idempotency_key: idempotencyKey ?? null,
          request_hash: requestHash,
          source_account_id: source.id,
          destination_account_id: destination.id,
          amount_cents: amountCents,
          currency: source.currency,
          narration: narration ?? null,
          status: 'COMPLETED',
        });

        await accountsRepository.updateBalance(trx, source.id, sourceBalance);
        await accountsRepository.updateBalance(trx, destination.id, destinationBalance);

        const common = { reference, channel: 'TRANSFER', amount_cents: amountCents, currency: source.currency, transfer_id: created.id };
        await transactionsRepository.insert(trx, [
          {
            ...common,
            account_id: source.id,
            entry_type: 'DEBIT',
            balance_after_cents: sourceBalance,
            narration: narration ?? `Transfer to ${maskAccountNumber(destination.account_number)}`,
            counterparty: `${destination.account_name} (${maskAccountNumber(destination.account_number)})`,
          },
          {
            ...common,
            account_id: destination.id,
            entry_type: 'CREDIT',
            balance_after_cents: destinationBalance,
            narration: narration ?? `Transfer from ${maskAccountNumber(source.account_number)}`,
            counterparty: `${source.account_name} (${maskAccountNumber(source.account_number)})`,
          },
        ]);

        return {
          record: {
            ...created, 
            source_account_number: source.account_number,
            source_user_id: source.user_id,
            destination_account_number: destination.account_number,
            destination_account_name: destination.account_name,
            destination_user_id: destination.user_id,
          },
          source: { ...source, balance_cents: sourceBalance },
        };
      });
    } catch (error) {
      // A concurrent request with the same Idempotency-Key won the race: return its result.
      if (idempotencyKey && isUniqueViolation(error, 'transfers_idempotency_unique')) {
        return replay(user, idempotencyKey, requestHash);
      }
      if (error.statusCode < 500) {
        logger.warn('Transfer rejected', { code: error.code, reason: error.message, sourceAccountNumber });
      }
      throw error;
    }

    const { record, source } = result;
    logger.info('Transfer completed', {
      reference: record.reference,
      amountCents,
      sourceAccount: maskAccountNumber(record.source_account_number),
      destinationAccount: maskAccountNumber(record.destination_account_number),
    });

    await events.publish(RoutingKeys.TRANSFER_COMPLETED, {
      reference: record.reference,
      amount: moneyView(amountCents, record.currency),
      sourceAccount: maskAccountNumber(record.source_account_number),
      destinationAccount: maskAccountNumber(record.destination_account_number),
      sourceUserId: record.source_user_id,
      destinationUserId: record.destination_user_id,
      sourceBalance: moneyView(source.balance_cents, source.currency),
      completedAt: record.created_at,
    });

    return { transfer: toTransferDto(record, user), sourceBalance: moneyView(source.balance_cents, source.currency), replayed: false };
  }

  // Retrieves a transfer by its reference, if the user is authorized to view it.
  async function getByReference(user, reference) {
    const record = await transfersRepository.findByReference(db, reference);
    const canView =
      record && (user.role === 'ADMIN' || record.source_user_id === user.id || record.destination_user_id === user.id);
    if (!canView) throw Errors.notFound('Transfer');
    return toTransferDto(record, user);
  }

  return { transfer, getByReference };
}

module.exports = { createTransfersService };
