'use strict';

const TABLE = 'transfers';

const create = async (trx, transfer) => (await trx(TABLE).insert(transfer).returning('*'))[0];

// Transfer joined with both accounts' public details.
const withAccounts = (db) =>
  db(`${TABLE} as t`)
    .join('accounts as src', 'src.id', 't.source_account_id')
    .join('accounts as dst', 'dst.id', 't.destination_account_id')
    .select(
      't.*',
      'src.account_number as source_account_number',
      'src.user_id as source_user_id',
      'dst.account_number as destination_account_number',
      'dst.account_name as destination_account_name',
      'dst.user_id as destination_user_id',
    );

const findByReference = (db, reference) => withAccounts(db).where('t.reference', reference).first();

const findByIdempotencyKey = (db, userId, idempotencyKey) =>
  withAccounts(db).where({ 't.initiated_by': userId, 't.idempotency_key': idempotencyKey }).first();

module.exports = { create, findByReference, findByIdempotencyKey };
