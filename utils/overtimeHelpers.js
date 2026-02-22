/**
 * Shared helpers for TM overtime APIs (config, rate-types, configuration).
 * Reduces duplication and keeps validation consistent.
 */

export function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function optStr(v) {
  if (v === undefined || v === null) return null;
  return String(v).trim() || null;
}

/** Parse query param as boolean; default true. 'false', '0', 'no' => false. */
export function parseReturnFullConfig(query) {
  const v = optStr(query?.return_full_config ?? query?.returnFullConfig);
  if (v == null) return true;
  const lower = v.toLowerCase();
  return lower !== 'false' && lower !== '0' && lower !== 'no';
}
