/**
 * Shared ISO-style three-letter currency_code parsing for ENT modules.
 */

export const ISO_CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export const DEFAULT_ISO_CURRENCY_CODE_ERROR =
  'currency_code must be a 3-letter currency code, for example KWD or USD';

/**
 * @param {unknown} value
 * @param {string} [invalidMessage]
 * @returns {{ ok: true, value: string|undefined } | { ok: false, error: string }}
 */
export function parseIsoCurrencyCode(value, invalidMessage = DEFAULT_ISO_CURRENCY_CODE_ERROR) {
  if (value === undefined || value === null) {
    return { ok: true, value: undefined };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: invalidMessage };
  }
  const normalized = value.trim().toUpperCase();
  if (normalized === '') {
    return { ok: true, value: undefined };
  }
  if (!ISO_CURRENCY_CODE_RE.test(normalized)) {
    return { ok: false, error: invalidMessage };
  }
  return { ok: true, value: normalized };
}

/**
 * Normalize currency_code from a package/view row (GET/LIST/RESOLVE).
 * @param {Record<string, unknown>} row
 * @returns {string|null}
 */
export function normalizeIsoCurrencyCodeFromRow(row) {
  const raw = row?.currency_code ?? row?.CURRENCY_CODE;
  if (raw == null || String(raw).trim() === '') return null;
  const parsed = parseIsoCurrencyCode(String(raw));
  return parsed.ok && parsed.value ? parsed.value : String(raw).trim().toUpperCase();
}
