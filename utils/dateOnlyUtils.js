/** Strict YYYY-MM-DD (no time component). */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {string} yyyyMmDd
 * @returns {boolean}
 */
export function isValidCalendarDateOnly(yyyyMmDd) {
  if (!DATE_ONLY_RE.test(yyyyMmDd)) return false;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * @param {string} yyyyMmDd
 * @returns {boolean}
 */
export function isFutureDateOnly(yyyyMmDd) {
  if (!isValidCalendarDateOnly(yyyyMmDd)) return false;
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  const value = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return value.getTime() > today.getTime();
}

/**
 * Parse YYYY-MM-DD to a local calendar Date for Oracle DATE binds.
 * Returns null when the value is missing or not a valid calendar date.
 * @param {unknown} v
 * @returns {Date|null}
 */
export function parseCalendarDateOnlyBind(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  if (!DATE_ONLY_RE.test(s) || !isValidCalendarDateOnly(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
