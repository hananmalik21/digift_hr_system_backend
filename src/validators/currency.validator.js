import {
  allowNegativeAmounts,
  allowUnknownIsoCodes,
  isKnownIso4217,
} from '../constants/currency.constants.js';
import { CurrencyValidationError } from '../errors/currency.errors.js';
import { isNegative, parseDecimal, toNumber } from '../utils/currencyDecimal.js';

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

function todayIsoDate() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isPresent(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function readField(source, ...keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      return source[key];
    }
  }
  return undefined;
}

function isValidCalendarDate(year, month, day) {
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function parseIsoDate(value, fieldName) {
  if (!isPresent(value)) {
    throw new CurrencyValidationError(`${fieldName} is required`);
  }
  const raw = String(value).trim();
  const match = ISO_DATE.exec(raw);
  if (!match) {
    throw new CurrencyValidationError(`${fieldName} must be a valid date in YYYY-MM-DD format`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!isValidCalendarDate(year, month, day)) {
    throw new CurrencyValidationError(`${fieldName} must be a valid calendar date`);
  }
  return raw;
}

function parseOptionalIsoDate(value, fieldName) {
  if (!isPresent(value)) return undefined;
  return parseIsoDate(value, fieldName);
}

function parseCurrencyCode(value, fieldName) {
  if (!isPresent(value)) {
    throw new CurrencyValidationError(`${fieldName} is required`);
  }
  const code = String(value).trim().toUpperCase();
  if (!ISO_CURRENCY.test(code)) {
    throw new CurrencyValidationError(`${fieldName} must be a 3-letter ISO 4217 currency code`);
  }
  if (!allowUnknownIsoCodes() && !isKnownIso4217(code)) {
    throw new CurrencyValidationError(`Invalid currency code: ${code}`);
  }
  return code;
}

function parseAmount(value, { allowNegative = allowNegativeAmounts() } = {}) {
  if (value === undefined || value === null || value === '') {
    throw new CurrencyValidationError('amount is required');
  }
  if (typeof value === 'boolean' || Array.isArray(value) || (typeof value === 'object' && value !== null)) {
    throw new CurrencyValidationError('amount must be a number');
  }
  let decimal;
  try {
    decimal = parseDecimal(value);
  } catch {
    throw new CurrencyValidationError('amount must be a valid number');
  }
  if (isNegative(decimal) && !allowNegative) {
    throw new CurrencyValidationError('amount must be zero or a positive number');
  }
  return toNumber(decimal);
}

export function parseConvertBody(body = {}) {
  const amountRaw = readField(body, 'amount');
  const fromRaw = readField(body, 'from_currency', 'fromCurrency');
  const toRaw = readField(body, 'to_currency', 'toCurrency');

  const missing = [];
  if (amountRaw === undefined || amountRaw === null || amountRaw === '') missing.push('amount');
  if (!isPresent(fromRaw)) missing.push('from_currency');
  if (!isPresent(toRaw)) missing.push('to_currency');
  if (missing.length === 3) {
    throw new CurrencyValidationError('amount, from_currency and to_currency are required');
  }
  if (missing.length > 0) {
    throw new CurrencyValidationError(
      `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required`
    );
  }

  return {
    amount: parseAmount(amountRaw),
    fromCurrency: parseCurrencyCode(fromRaw, 'from_currency'),
    toCurrency: parseCurrencyCode(toRaw, 'to_currency'),
    conversionDate:
      parseOptionalIsoDate(readField(body, 'conversion_date', 'conversionDate'), 'conversion_date') ||
      todayIsoDate(),
  };
}
