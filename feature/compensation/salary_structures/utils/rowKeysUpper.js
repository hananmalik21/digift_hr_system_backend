/**
 * Normalize Oracle OUT_FORMAT_OBJECT row keys to uppercase for stable lookups.
 * @param {object} row
 * @returns {Record<string, unknown>}
 */
export function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}
