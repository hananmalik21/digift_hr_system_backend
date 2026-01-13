/**
 * GUID Utilities
 * Handles Oracle SYS_GUID() RAW(16) conversion to/from hex strings
 */

import oracledb from 'oracledb';

/**
 * Check if a string is a valid 32-character hex string (GUID format)
 * @param {string} value - Value to check
 * @returns {boolean} True if valid hex32 string
 */
export function isHex32(value) {
  return typeof value === 'string' && /^[0-9a-fA-F]{32}$/.test(value);
}

/**
 * Normalize a hex32 string to uppercase
 * @param {string} value - Hex string to normalize
 * @returns {string} Uppercase hex string
 */
export function normalizeHex32(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

/**
 * Convert Oracle RAW(16) Buffer to hex string
 * @param {Buffer} buffer - Oracle RAW(16) buffer
 * @returns {string} 32-character uppercase hex string
 */
export function bufferToHex(buffer) {
  if (!buffer) return null;
  if (Buffer.isBuffer(buffer)) {
    return buffer.toString('hex').toUpperCase();
  }
  if (typeof buffer === 'string' && isHex32(buffer)) {
    return normalizeHex32(buffer);
  }
  return buffer;
}

/**
 * Convert hex string to Oracle RAW(16) Buffer
 * @param {string} hexString - 32-character hex string
 * @returns {Buffer} Oracle RAW(16) buffer
 */
export function hexToBuffer(hexString) {
  if (!hexString) return null;
  const normalized = normalizeHex32(hexString);
  if (!isHex32(normalized)) {
    throw new Error(`Invalid hex32 string: ${hexString}`);
  }
  return Buffer.from(normalized, 'hex');
}

/**
 * Generate a new SYS_GUID from Oracle database
 * @param {Object} connection - Oracle database connection
 * @returns {Promise<{buffer: Buffer, hex: string}>} Object with buffer and hex string
 */
export async function generateSysGuid(connection) {
  const result = await connection.execute(
    `SELECT SYS_GUID() AS GUID FROM DUAL`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  
  if (!result.rows || result.rows.length === 0) {
    throw new Error('Failed to generate SYS_GUID: No rows returned from database');
  }
  
  const row = result.rows[0];
  if (!row) {
    throw new Error('Failed to generate SYS_GUID: First row is undefined');
  }
  
  // Try both uppercase and lowercase column names (Oracle may return either)
  const buffer = row.GUID || row.guid;
  
  if (!buffer) {
    const availableKeys = Object.keys(row).join(', ');
    throw new Error(`Failed to generate SYS_GUID: GUID column not found. Available columns: ${availableKeys}`);
  }
  
  if (!Buffer.isBuffer(buffer)) {
    throw new Error(`Failed to generate SYS_GUID: Expected Buffer, got ${typeof buffer} (${buffer})`);
  }
  
  const hex = buffer.toString('hex').toUpperCase();
  return { buffer, hex };
}

/**
 * Convert structure_id Buffer to hex string in an object
 * Recursively processes objects and arrays
 * @param {*} obj - Object, array, or value to process
 * @returns {*} Object with structure_id converted to hex string
 */
export function convertStructureIdToHex(obj) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Buffer.isBuffer(obj)) {
    // If it's a buffer, assume it's a structure_id and convert to hex
    return bufferToHex(obj);
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => convertStructureIdToHex(item));
  }

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() === 'structure_id' && Buffer.isBuffer(value)) {
      converted[key] = bufferToHex(value);
    } else if (value === null || value === undefined) {
      converted[key] = value;
    } else if (value instanceof Date || Buffer.isBuffer(value)) {
      converted[key] = Buffer.isBuffer(value) ? bufferToHex(value) : value;
    } else if (typeof value === 'object') {
      converted[key] = convertStructureIdToHex(value);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

