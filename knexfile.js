'use strict';

// Load environment variables from .env file, if present
require('dotenv').config({ quiet: true });

module.exports = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 1, max: 5 },
  migrations: { directory: './src/db/migrations', tableName: 'knex_migrations' },
  seeds: { directory: './src/db/seeds' },
};
