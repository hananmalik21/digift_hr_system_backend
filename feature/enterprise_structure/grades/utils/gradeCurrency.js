/**
 * ISO-style currency_code handling for ENT.GRADES payloads.
 * Validation stays in the controller; the model only normalizes/omits for Oracle.
 */

const ISO_CURRENCY_CODE = /^[A-Z]{3}$/;

export const GRADE_CURRENCY_CODE_ERROR = 'CURRENCY_CODE must be a valid 3-letter currency code';
export const DEFAULT_GRADE_CURRENCY = 'KWD';

/**
 * @param {unknown} value
 * @returns {{ ok: true, value: string|undefined } | { ok: false, error: string }}
 */
export function parseGradeCurrencyCode(value) {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: GRADE_CURRENCY_CODE_ERROR };
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    return { ok: true, value: undefined };
  }
  if (!ISO_CURRENCY_CODE.test(normalized)) {
    return { ok: false, error: GRADE_CURRENCY_CODE_ERROR };
  }
  return { ok: true, value: normalized };
}

/**
 * Resolve a currency for an Oracle payload. Invalid values are omitted (controller rejects them first).
 * @param {unknown} value
 * @param {{ defaultCurrency?: string }} [options]
 * @returns {string|undefined}
 */
export function resolveGradeCurrencyCode(value, { defaultCurrency } = {}) {
  const parsed = parseGradeCurrencyCode(value);
  if (!parsed.ok) return undefined;
  return parsed.value !== undefined ? parsed.value : defaultCurrency;
}

/**
 * Validate and normalize currency_code on a grade request body (mutates `data`).
 * @param {Record<string, unknown>} data
 * @param {string[]} errors
 */
export function applyGradeCurrencyCode(data, errors) {
  const raw = data.CURRENCY_CODE ?? data.currency_code;
  if (raw === undefined) return;

  const parsed = parseGradeCurrencyCode(raw);
  if (!parsed.ok) {
    errors.push(parsed.error);
    return;
  }

  delete data.currency_code;
  if (parsed.value === undefined) {
    delete data.CURRENCY_CODE;
    return;
  }
  data.CURRENCY_CODE = parsed.value;
}
