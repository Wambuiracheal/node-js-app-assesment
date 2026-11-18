'use strict';

const TABLE = 'accounts';

const create = async (db, account) => (await db(TABLE).insert(account).returning('*'))[0];

const findByNumber = (db, accountNumber) => db(TABLE).where({ account_number: accountNumber }).first();

const listByUser = (db, userId) => db(TABLE).where({ user_id: userId }).orderBy('created_at', 'asc');

const countByUser = async (db, userId) => {
  const { count } = await db(TABLE).where({ user_id: userId }).count({ count: '*' }).first();
  return Number(count);
};

//locked accounts by account numbers for update, in order to prevent race conditions when updating balances
const lockByNumbers = (trx, accountNumbers) =>
  trx(TABLE).whereIn('account_number', accountNumbers).orderBy('id').forUpdate();

const lockById = (trx, id) => trx(TABLE).where({ id }).forUpdate().first();

const updateBalance = (trx, id, balanceCents) =>
  trx(TABLE).where({ id }).update({ balance_cents: balanceCents, updated_at: trx.fn.now() });

module.exports = { create, findByNumber, listByUser, countByUser, lockByNumbers, lockById, updateBalance };
