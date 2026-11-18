'use strict';

exports.up = async (knex) => {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('full_name', 120).notNullable();
    t.string('email', 254).notNullable().unique();
    t.string('phone_number', 12).notNullable().unique();
    t.string('password_hash', 100).notNullable();
    t.enu('role', ['CUSTOMER', 'ADMIN'], { useNative: true, enumName: 'user_role' })
      .notNullable()
      .defaultTo('CUSTOMER');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('accounts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('account_number', 14).notNullable().unique();
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    t.string('account_name', 80).notNullable();
    t.specificType('currency', 'char(3)').notNullable().defaultTo('KES');
    t.bigInteger('balance_cents').notNullable().defaultTo(0);
    t.enu('status', ['ACTIVE', 'FROZEN', 'CLOSED'], { useNative: true, enumName: 'account_status' })
      .notNullable()
      .defaultTo('ACTIVE');
    t.timestamps(true, true);
    t.index(['user_id']);
    t.check('?? >= 0', ['balance_cents'], 'accounts_balance_non_negative');
  });

  await knex.schema.createTable('transfers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('reference', 20).notNullable().unique();
    t.uuid('initiated_by').notNullable().references('id').inTable('users');
    t.string('idempotency_key', 64);
    t.string('request_hash', 64);
    t.uuid('source_account_id').notNullable().references('id').inTable('accounts');
    t.uuid('destination_account_id').notNullable().references('id').inTable('accounts');
    t.bigInteger('amount_cents').notNullable();
    t.specificType('currency', 'char(3)').notNullable();
    t.string('narration', 140);
    t.string('status', 20).notNullable().defaultTo('COMPLETED');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['initiated_by', 'idempotency_key'], { indexName: 'transfers_idempotency_unique' });
    t.index(['source_account_id', 'created_at']);
    t.index(['destination_account_id', 'created_at']);
    t.check('?? > 0', ['amount_cents'], 'transfers_amount_positive');
    t.check('?? <> ??', ['source_account_id', 'destination_account_id'], 'transfers_distinct_accounts');
  });

  await knex.schema.createTable('mpesa_requests', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('merchant_request_id', 64).notNullable();
    t.string('checkout_request_id', 64).notNullable().unique();
    t.uuid('account_id').notNullable().references('id').inTable('accounts');
    t.uuid('initiated_by').notNullable().references('id').inTable('users');
    t.string('phone_number', 12).notNullable();
    t.bigInteger('amount_cents').notNullable();
    t.enu('status', ['PENDING', 'COMPLETED', 'FAILED'], { useNative: true, enumName: 'mpesa_request_status' })
      .notNullable()
      .defaultTo('PENDING');
    t.integer('result_code');
    t.string('result_desc', 255);
    t.string('mpesa_receipt_number', 20).unique();
    t.timestamp('transaction_date', { useTz: true });
    t.timestamps(true, true);
    t.index(['account_id', 'created_at']);
  });

  await knex.schema.createTable('transactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('account_id').notNullable().references('id').inTable('accounts');
    t.string('reference', 20).notNullable();
    t.enu('entry_type', ['CREDIT', 'DEBIT'], { useNative: true, enumName: 'ledger_entry_type' }).notNullable();
    t.enu('channel', ['MPESA', 'TRANSFER', 'SYSTEM'], { useNative: true, enumName: 'transaction_channel' })
      .notNullable();
    t.bigInteger('amount_cents').notNullable();
    t.bigInteger('balance_after_cents').notNullable();
    t.specificType('currency', 'char(3)').notNullable();
    t.string('narration', 200);
    t.string('counterparty', 120);
    t.string('external_reference', 64);
    t.uuid('transfer_id').references('id').inTable('transfers');
    t.uuid('mpesa_request_id').references('id').inTable('mpesa_requests');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['account_id', 'reference'], { indexName: 'transactions_account_reference_unique' });
    t.index(['account_id', 'created_at']);
    t.check('?? > 0', ['amount_cents'], 'transactions_amount_positive');
  });
};

exports.down = async (knex) => {
  await knex.schema
    .dropTableIfExists('transactions')
    .dropTableIfExists('mpesa_requests')
    .dropTableIfExists('transfers')
    .dropTableIfExists('accounts')
    .dropTableIfExists('users');
  await knex.raw(`
    DROP TYPE IF EXISTS transaction_channel;
    DROP TYPE IF EXISTS ledger_entry_type;
    DROP TYPE IF EXISTS mpesa_request_status;
    DROP TYPE IF EXISTS account_status;
    DROP TYPE IF EXISTS user_role;
  `);
};
