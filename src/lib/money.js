'use strict';


const MINOR_UNITS_PER_MAJOR = 100;
const DEFAULT_CURRENCY = 'KES';
const DEFAULT_LOCALE = 'en-KE';

const formatters = new Map()

function getFormatter(currency, locale) {
  const key = `${locale}:${currency}`;
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }),
    );
  }
  return formatters.get(key);
}

function hasAtMostTwoDecimals(amount) {
  const scaled = amount * MINOR_UNITS_PER_MAJOR;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

function toMinorUnits(amount) {
  if (!Number.isFinite(amount)) throw new TypeError(`Invalid amount: ${amount}`);
  return Math.round(amount * MINOR_UNITS_PER_MAJOR);
}

const toMajorUnits = (minorUnits) => minorUnits / MINOR_UNITS_PER_MAJOR;


function formatMoney(minorUnits, currency = DEFAULT_CURRENCY, locale = DEFAULT_LOCALE) {
  return getFormatter(currency, locale).format(toMajorUnits(minorUnits)).replace(/ /g, ' ');
}

const moneyView = (minorUnits, currency = DEFAULT_CURRENCY) => ({
  amount: toMajorUnits(minorUnits),
  minorUnits,
  currency,
  formatted: formatMoney(minorUnits, currency),
});

module.exports = {
  DEFAULT_CURRENCY,
  hasAtMostTwoDecimals,
  toMinorUnits,
  toMajorUnits,
  formatMoney,
  moneyView,
};
