'use strict';

const TABLE = 'transactions';

// Ledger entries are append-only: there is deliberately no update or delete.
const insert = (trx, entries) => trx(TABLE).insert(entries).returning('*');


async function listByAccount(db, accountId, { page, limit, type }) {
  const base = db(TABLE)
    .where({ account_id: accountId })
    .modify((query) => {
      if (type) query.andWhere({ entry_type: type });
    });

  const [rows, { count }] = await Promise.all([
    base
      .clone()
      .orderBy([{ column: 'created_at', order: 'desc' }, { column: 'id', order: 'desc' }])
      .limit(limit)
      .offset((page - 1) * limit),
    base.clone().count({ count: '*' }).first(),
  ]);

  return { rows, total: Number(count) };
}

module.exports = { insert, listByAccount };
