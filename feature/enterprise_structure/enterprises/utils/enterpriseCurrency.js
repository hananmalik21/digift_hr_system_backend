/**
 * Enterprise currency_code validation for ENT.ENT_ENTERPRISES_PKG payloads.
 */

import { parseIsoCurrencyCode } from '../../shared/isoCurrencyCode.js';

export const ENTERPRISE_CURRENCY_CODE_ERROR =
  'currency_code must be a 3-letter currency code, for example KWD or USD';
export const ENTERPRISE_CURRENCY_REQUIRED_ERROR = 'currency_code is required';

/** @param {unknown} value */
export function parseEnterpriseCurrencyCode(value) {
  return parseIsoCurrencyCode(value, ENTERPRISE_CURRENCY_CODE_ERROR);
}

/**
 * Validate and normalize currency_code on an enterprise request body (mutates `data`).
 * @param {Record<string, unknown>} data
 * @param {string[]} errors
 * @param {{ required?: boolean }} [options]
 */
export function applyEnterpriseCurrencyCode(data, errors, { required = false } = {}) {
  const raw = data.CURRENCY_CODE ?? data.currency_code;

  if (raw === undefined || raw === null) {
    if (required) errors.push(ENTERPRISE_CURRENCY_REQUIRED_ERROR);
    return;
  }

  const parsed = parseEnterpriseCurrencyCode(raw);
  if (!parsed.ok) {
    errors.push(parsed.error);
    return;
  }

  delete data.currency_code;
  if (parsed.value === undefined) {
    if (required) errors.push(ENTERPRISE_CURRENCY_REQUIRED_ERROR);
    delete data.CURRENCY_CODE;
    return;
  }

  data.CURRENCY_CODE = parsed.value;
}

/** @param {unknown} value */
export function parseEnterpriseCurrencyFilter(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return { ok: true, value: undefined };
  }
  return parseEnterpriseCurrencyCode(value);
}
