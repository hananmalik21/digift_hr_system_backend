/**
 * Shared row coercion helpers for COMP.COMP_ADJUSTMENT_DETAILS_FULL_V (Oracle → API).
 */

/**
 * @param {Record<string, unknown>} r - uppercased column map
 * @param {string} key
 * @returns {string|null}
 */
export function strOrNull(r, key) {
  const v = r[key];
  return v != null ? String(v) : null;
}

/**
 * @param {(k: string) => unknown} g - getter from uppercased row
 * @param {string[]} keys - tried in order
 * @returns {string|null}
 */
export function firstStrOrNull(g, keys) {
  for (const k of keys) {
    const v = g(k);
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return null;
}
