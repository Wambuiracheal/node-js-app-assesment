'use strict';


const crypto = require('node:crypto');


const ACCOUNT_PREFIX = '01';
const ACCOUNT_NUMBER_LENGTH = 14;

function luhnCheckDigit(digits) {
  let sum = 0;
  let double = true;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

function generateAccountNumber() {
  const randomPart = crypto.randomInt(0, 1e11).toString().padStart(11, '0');
  const body = `${ACCOUNT_PREFIX}${randomPart}`;
  return `${body}${luhnCheckDigit(body)}`;
}

function isValidAccountNumber(value) {
  return (
    typeof value === 'string' &&
    new RegExp(`^\\d{${ACCOUNT_NUMBER_LENGTH}}$`).test(value) &&
    luhnCheckDigit(value.slice(0, -1)) === Number(value.at(-1))
  );
}

const maskAccountNumber = (value) => `${value.slice(0, 2)}${'*'.repeat(value.length - 6)}${value.slice(-4)}`;

const KENYAN_MSISDN = /^(?:\+?254|0)?([17]\d{8})$/;

function normalizeKenyanPhone(value) {
  if (typeof value !== 'string') return null;
  const match = value.replace(/[\s-]/g, '').match(KENYAN_MSISDN);
  return match ? `254${match[1]}` : null;
}

const maskPhone = (msisdn) => `${msisdn.slice(0, 4)}****${msisdn.slice(-4)}`;

const REFERENCE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomString(length, alphabet = REFERENCE_ALPHABET) {
  let result = '';
  for (let i = 0; i < length; i += 1) result += alphabet[crypto.randomInt(alphabet.length)];
  return result;
}


function generateReference(prefix) {
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  return `${prefix}${date}${randomString(8)}`;
}

module.exports = {
  generateAccountNumber,
  isValidAccountNumber,
  maskAccountNumber,
  luhnCheckDigit,
  normalizeKenyanPhone,
  maskPhone,
  generateReference,
  randomString,
};
