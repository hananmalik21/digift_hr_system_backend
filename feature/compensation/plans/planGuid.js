/** Oracle `RAW(16)` plan GUID serialized as 32 uppercase hex characters (for `HEXTORAW`). */
export const PLAN_GUID_HEX_REGEX = /^[0-9A-F]{32}$/;

export const PLAN_GUID_VALIDATION_MESSAGE =
  'plan_guid must be a 32-character hexadecimal string';

/**
 * @param {unknown} value
 * @returns {string | null} normalized 32-char hex or null if invalid / empty
 */
export function normalizePlanGuidHex(value) {
  if (value == null) return null;
  const s = String(value).trim().toUpperCase();
  return PLAN_GUID_HEX_REGEX.test(s) ? s : null;
}
