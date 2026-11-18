'use strict';

const TABLE = 'mpesa_requests';

const create = async (db, request) => (await db(TABLE).insert(request).returning('*'))[0];

const findByCheckoutRequestId = (db, checkoutRequestId) =>
  db(`${TABLE} as m`)
    .join('accounts as a', 'a.id', 'm.account_id')
    .select('m.*', 'a.account_number', 'a.user_id as account_user_id', 'a.currency')
    .where('m.checkout_request_id', checkoutRequestId)
    .first();

/** Locks the request row so duplicate callbacks are processed strictly one at a time. */
const lockByCheckoutRequestId = (trx, checkoutRequestId) =>
  trx(TABLE).where({ checkout_request_id: checkoutRequestId }).forUpdate().first();

const update = async (trx, id, changes) =>
  (await trx(TABLE).where({ id }).update({ ...changes, updated_at: trx.fn.now() }).returning('*'))[0];

module.exports = { create, findByCheckoutRequestId, lockByCheckoutRequestId, update };
