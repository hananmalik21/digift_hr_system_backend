/**
 * Oracle RAW(16) GUID conversion helpers.
 * API accepts GUID as 32-char hex string or standard GUID string (with dashes).
 * Converts to Buffer for node-oracledb RAW bind; converts Buffer back to hex string for JSON.
 */

const HEX_LEN = 32;
const HEX_REGEX = /^[0-9A-Fa-f]{32}$/;

/**
 * Normalize input to 32-char hex string (no dashes). Returns null if invalid.
 * @param {string} input - 32-char hex string or standard GUID (e.g. xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
 * @returns {string|null} - Lowercase hex string or null
 */
export function guidToHex(input) {
  if (input == null || typeof input !== 'string') return null;
  const trimmed = String(input).trim();
  const hex = trimmed.replace(/-/g, '');
  if (hex.length !== HEX_LEN || !HEX_REGEX.test(hex)) return null;
  return hex.toLowerCase();
}

/**
 * Convert GUID string (32-char hex or with dashes) to Buffer for Oracle RAW(16) bind.
 * @param {string} guidStr - 32-char hex or standard GUID string
 * @returns {Buffer|null} - 16-byte Buffer or null if invalid
 */
export function guidToBuffer(guidStr) {
  const hex = guidToHex(guidStr);
  if (!hex) return null;
  return Buffer.from(hex, 'hex');
}

/**
 * Convert Buffer (Oracle RAW) to 32-char hex string for API response.
 * @param {Buffer|Uint8Array|null} buf - RAW(16) value from Oracle
 * @returns {string|null} - 32-char hex string or null
 */
export function bufferToGuidHex(buf) {
  if (buf == null) return null;
  if (Buffer.isBuffer(buf)) return buf.toString('hex').toLowerCase();
  if (buf instanceof Uint8Array) return Buffer.from(buf).toString('hex').toLowerCase();
  return null;
}
