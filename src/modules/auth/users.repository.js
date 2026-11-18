'use strict';

const TABLE = 'users';

const create = async (db, user) => (await db(TABLE).insert(user).returning('*'))[0];

const findById = (db, id) => db(TABLE).where({ id }).first();

const findByEmail = (db, email) => db(TABLE).where({ email }).first();

const findByEmailOrPhone = (db, { email, phoneNumber }) =>
  db(TABLE).where({ email }).orWhere({ phone_number: phoneNumber }).first();

module.exports = { create, findById, findByEmail, findByEmailOrPhone };
