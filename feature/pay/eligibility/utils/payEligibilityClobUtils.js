import { readClobOut } from '../../../../utils/oracleClobBinds.js';

/**
 * Read an Oracle CLOB OUT bind fully and return text.
 * Handles string values (fetchAsString) and Lob objects.
 *
 * @param {unknown} clob
 * @returns {Promise<string|null>}
 */
export async function readClob(clob) {
  if (clob == null) return null;

  const value = Array.isArray(clob) ? clob[0] : clob;
  if (value == null) return null;
  if (typeof value === 'string') return value;

  return readClobOut(value);
}

/**
 * Parse a CLOB OUT bind as a JSON object. Returns null when empty/invalid.
 *
 * @param {unknown} clobVal
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function parseResultJsonClob(clobVal) {
  const raw = await readClob(clobVal);
  if (raw == null || String(raw).trim() === '') return null;

  try {
    const parsed = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
