import { ValidationError } from '../../../../utils/errors/index.js';
import { bufferToGuidHex, guidToHex } from '../../../../src/utils/oracleGuid.js';

/**
 * Normalize MODULE_GUID from Oracle or JSON for API (32-char uppercase hex, no dashes).
 * @param {unknown} val
 * @returns {string|null}
 */
export function moduleGuidFromDb(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
    const h = bufferToGuidHex(val);
    return h ? h.toUpperCase() : null;
  }
  const s = String(val).trim();
  if (!s) return null;
  const fromGuid = guidToHex(s);
  if (fromGuid) return fromGuid.toUpperCase();
  if (/^[0-9A-Fa-f]{64}$/.test(s)) {
    try {
      const decoded = Buffer.from(s, 'hex').toString('ascii');
      const inner = guidToHex(decoded);
      if (inner) return inner.toUpperCase();
    } catch (_) {
      /* ignore */
    }
  }
  return null;
}

/**
 * @param {unknown} raw
 * @param {string} [fieldName]
 * @returns {string} 32-char uppercase hex
 */
export function parseModuleGuidHexOrThrow(raw, fieldName = 'module_guid') {
  const hex = guidToHex(String(raw ?? '').trim());
  if (!hex) {
    throw new ValidationError('Validation failed', [
      `${fieldName} must be a 32-character hexadecimal string (dashes optional)`
    ]);
  }
  return hex.toUpperCase();
}

/**
 * @param {unknown} v
 * @returns {string|null}
 */
export function normalizeOutGuidHex(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutGuidHex(v[0]);
  return moduleGuidFromDb(v);
}
