/**
 * ISO 4217 currency metadata used by the shared conversion service.
 * Minor units follow the ISO 4217 standard (KWD/BHD/OMR = 3, JPY = 0, most = 2).
 */

export const FRANKFURTER_RATE_SOURCE = 'FRANKFURTER';
export const SAME_CURRENCY_SOURCE = 'SAME_CURRENCY';

export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EXCHANGE_RATE_NOT_FOUND: 'EXCHANGE_RATE_NOT_FOUND',
  EXCHANGE_RATE_PROVIDER_ERROR: 'EXCHANGE_RATE_PROVIDER_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/** Display scale for the provider rate before it is returned to clients. */
export const RATE_DISPLAY_SCALE = 8;

const MINOR_UNITS_0 = [
  'BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG',
  'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
];

const MINOR_UNITS_3 = [
  'BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND',
];

const MINOR_UNITS_4 = ['CLF', 'UYW'];

/**
 * Active ISO 4217 alphabetic codes commonly used in HR/payroll, plus GCC and major trading currencies.
 * Codes not listed are still accepted if they match /^[A-Z]{3}$/ only when CURRENCY_STRICT_ISO=false.
 * Default is strict membership in this set.
 */
export const ISO_4217_CODES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BRL',
  'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHF', 'CLP', 'CNY',
  'COP', 'CRC', 'CUP', 'CVE', 'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP',
  'ERN', 'ETB', 'EUR', 'FJD', 'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD',
  'GNF', 'GTQ', 'GYD', 'HKD', 'HNL', 'HTG', 'HUF', 'IDR', 'ILS', 'INR',
  'IQD', 'IRR', 'ISK', 'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF',
  'KRW', 'KWD', 'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD',
  'MAD', 'MDL', 'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR',
  'MWK', 'MXN', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD',
  'OMR', 'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON',
  'RSD', 'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP',
  'SLE', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS',
  'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD',
  'UYU', 'UZS', 'VES', 'VND', 'VUV', 'WST', 'XAF', 'XCD', 'XOF', 'XPF',
  'YER', 'ZAR', 'ZMW', 'ZWG',
]);

const MINOR_UNIT_MAP = new Map();
for (const code of MINOR_UNITS_0) MINOR_UNIT_MAP.set(code, 0);
for (const code of MINOR_UNITS_3) MINOR_UNIT_MAP.set(code, 3);
for (const code of MINOR_UNITS_4) MINOR_UNIT_MAP.set(code, 4);

/**
 * @param {string} currencyCode uppercase ISO 4217
 * @returns {number} ISO minor units (decimal places)
 */
export function getCurrencyMinorUnits(currencyCode) {
  return MINOR_UNIT_MAP.get(currencyCode) ?? 2;
}

export function isKnownIso4217(code) {
  return ISO_4217_CODES.has(code);
}

export function allowUnknownIsoCodes() {
  return String(process.env.CURRENCY_STRICT_ISO || 'true').toLowerCase() === 'false';
}

export function allowNegativeAmounts() {
  return String(process.env.CURRENCY_ALLOW_NEGATIVE_AMOUNTS || 'false').toLowerCase() === 'true';
}
