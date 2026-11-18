'use strict';

/**
 * Demo data for local development ONLY. Wipes existing rows.
 *
 *   admin@example.com     / Password123!  (ADMIN)
 *   jane.doe@example.com  / Password123!  (CUSTOMER, KES 50,000.00)
 *   john.doe@example.com  / Password123!  (CUSTOMER, KES 12,500.00)
 */
const bcrypt = require('bcryptjs');
const { generateAccountNumber, generateReference } = require('../../lib/identifiers');

const PASSWORD = 'Password123!';

const DEMO_USERS = [
  { full_name: 'System Admin', email: 'admin@example.com', phone_number: '254700000100', role: 'ADMIN' },
  { full_name: 'Jane Doe', email: 'jane.doe@example.com', phone_number: '254711111111', openingCents: 5_000_000 },
  { full_name: 'John Doe', email: 'john.doe@example.com', phone_number: '254722222222', openingCents: 1_250_000 },
];

exports.seed = async (knex) => {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo data in production');

  await knex.raw('TRUNCATE transactions, mpesa_requests, transfers, accounts, users CASCADE');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const { openingCents, ...user } of DEMO_USERS) {
    const [created] = await knex('users')
      .insert({ ...user, password_hash: passwordHash })
      .returning('*');

    if (user.role === 'ADMIN') continue;

    const [account] = await knex('accounts')
      .insert({
        account_number: generateAccountNumber(),
        user_id: created.id,
        account_name: `${created.full_name} - Main`,
        balance_cents: openingCents,
      })
      .returning('*');

    await knex('transactions').insert({
      account_id: account.id,
      reference: generateReference('OPN'),
      entry_type: 'CREDIT',
      channel: 'SYSTEM',
      amount_cents: openingCents,
      balance_after_cents: openingCents,
      currency: 'KES',
      narration: 'Opening balance',
    });

    // eslint-disable-next-line no-console
    console.log(`Seeded ${created.email} -> account ${account.account_number}`);
  }
};
