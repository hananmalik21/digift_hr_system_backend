/**
 * ISO 4217 code validation used by the shared conversion service.
 * Decimal precision comes from ENT.CURRENCIES via GET /api/enterprise/currencies
 * (do not hardcode minor units here).
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

export function isKnownIso4217(code) {
  return ISO_4217_CODES.has(code);
}

function envFlag(name, defaultValue) {
  return String(process.env[name] ?? defaultValue).trim().toLowerCase() === 'true';
}

/** Unknown ISO codes are rejected unless CURRENCY_STRICT_ISO=false. */
export function allowUnknownIsoCodes() {
  return !envFlag('CURRENCY_STRICT_ISO', 'true');
}

export function allowNegativeAmounts() {
  return envFlag('CURRENCY_ALLOW_NEGATIVE_AMOUNTS', 'false');
}
