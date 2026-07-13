import { readClobOut } from '../../../compensation/utils/oracleClobBinds.js';

/**
 * Read an Oracle CLOB OUT bind fully and return the text content.
 *
 * @param {unknown} val
 * @returns {Promise<string|null>}
 */
export async function readClobOutFully(val) {
  if (val == null) return null;
  return readClobOut(Array.isArray(val) ? val[0] : val);
}

/**
 * Parse a CLOB OUT bind containing a JSON object.
 *
 * @param {unknown} clobVal
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function parseResultJsonClob(clobVal) {
  const raw = await readClobOutFully(clobVal);
  if (raw == null || String(raw).trim() === '') return null;

  try {
    const parsed = JSON.parse(String(raw));
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}
