'use strict';

const path = require('node:path');
const knex = require('knex');
const pg = require('pg');

//purse from cents to shillings
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new RangeError(`BIGINT ${value} exceeds safe integer range`);
  return parsed;
});

function createDb({ url, poolMax = 10 }) {
  return knex({
    client: 'pg',
    connection: url,
    pool: { min: 0, max: poolMax },
    migrations: { directory: path.join(__dirname, 'migrations'), tableName: 'knex_migrations' },
  });
}

module.exports = { createDb };
