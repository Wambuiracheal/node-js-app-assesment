'use strict';

const bcrypt = require('bcryptjs');
const config = require('../../config');
const logger = require('../../lib/logger');
const { Errors, isUniqueViolation } = require('../../lib/errors');
const usersRepository = require('./users.repository');
const { signAccessToken, decodeExpiry } = require('./token');
const { toUserDto } = require('./auth.presenter');
const { toAccountDto } = require('../accounts/accounts.presenter');

// Compared against when the e-mail is unknown so response time doesn't reveal which e-mails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', 4);

function createAuthService({ db, accountsService }) {
  function issueToken(user) {
    const accessToken = signAccessToken(user);
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresAt: new Date(decodeExpiry(accessToken) * 1000).toISOString(),
    };
  }

// Creates the customer and their first (main) account atomically. 
  async function register({ fullName, email, phoneNumber, password }) {
    const existing = await usersRepository.findByEmailOrPhone(db, { email, phoneNumber });
    if (existing) {
      throw Errors.conflict('USER_ALREADY_EXISTS', 'A customer with this email or phone number already exists');
    }

    const passwordHash = await bcrypt.hash(password, config.auth.bcryptRounds);

    try {
      const { user, account } = await db.transaction(async (trx) => {
        const created = await usersRepository.create(trx, {
          full_name: fullName,
          email,
          phone_number: phoneNumber,
          password_hash: passwordHash,
        });
        const main = await accountsService.openAccount(created, { accountName: `${fullName} - Main` }, trx);
        return { user: created, account: main };
      });

      logger.info('Customer registered', { userId: user.id, accountNumber: account.account_number });
      return { user: toUserDto(user), account: toAccountDto(account), ...issueToken(user) };
    } catch (error) {
      // Lost a race with a concurrent registration for the same e-mail/phone.
      if (isUniqueViolation(error)) {
        throw Errors.conflict('USER_ALREADY_EXISTS', 'A customer with this email or phone number already exists');
      }
      throw error;
    }
  }

  async function login({ email, password }) {
    const user = await usersRepository.findByEmail(db, email);
    const passwordMatches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);

    if (!user || !passwordMatches) {
      logger.warn('Failed login attempt', { email });
      throw Errors.unauthorized('Invalid email or password');
    }

    logger.info('Customer logged in', { userId: user.id });
    return { user: toUserDto(user), ...issueToken(user) };
  }

  async function getProfile(userId) {
    const user = await usersRepository.findById(db, userId);
    if (!user) throw Errors.notFound('User');
    return toUserDto(user);
  }

  return { register, login, getProfile };
}

module.exports = { createAuthService };
