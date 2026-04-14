/**
 * Convert object keys to lowercase snake_case.
 *
 * Notes:
 * - Oracle OUT_FORMAT_OBJECT commonly returns keys in UPPER_CASE.
 * - Most DB column names are already snake_case; this utility primarily lowercases safely.
 * - Buffers/Dates are preserved (not recursed into).
 */

export function convertKeysToSnakeCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date || obj instanceof Buffer) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => convertKeysToSnakeCase(item));

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = String(key).toLowerCase();
    if (value === null || value === undefined) converted[newKey] = value;
    else if (value instanceof Date || value instanceof Buffer) converted[newKey] = value;
    else if (typeof value === 'object') converted[newKey] = convertKeysToSnakeCase(value);
    else converted[newKey] = value;
  }
  return converted;
}

