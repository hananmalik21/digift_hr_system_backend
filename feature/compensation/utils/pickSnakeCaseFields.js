/**
 * Pick named fields from an Oracle/JSON object (handles UPPER and lower keys).
 *
 * @param {Record<string, unknown>} obj
 * @param {readonly string[]} keys
 * @returns {Record<string, unknown>}
 */
export function pickSnakeCaseFields(obj, keys) {
  const out = {};
  for (const key of keys) {
    const upper = key.toUpperCase();
    if (obj[key] !== undefined) out[key] = obj[key];
    else if (obj[upper] !== undefined) out[key] = obj[upper];
  }
  return out;
}
