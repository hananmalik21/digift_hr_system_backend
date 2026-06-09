/**
 * GUID Utilities
 * Comprehensive utilities for handling Oracle RAW(16) GUID fields
 * Works with 32-character hex strings (GUIDs) and Oracle RAW(16) buffers
 * 
 * This utility provides:
 * - Normalization: Convert various GUID formats to standard 32-char hex
 * - Validation: Ensure GUIDs are in correct format
 * - Conversion: Convert between hex strings and Oracle RAW(16) buffers
 * - Generation: Generate new GUIDs from Oracle database
 */

import oracledb from 'oracledb';
import { ValidationError } from './errors/index.js';

/** 32 hexadecimal characters after optional hyphen removal */
const REGEX_HEX_32 = /^[0-9A-Fa-f]{32}$/;

/** Oracle/JSON occasionally exposes GUIDs as 64 hex digits encoding ASCII hex */
const REGEX_HEX_64 = /^[0-9A-Fa-f]{64}$/;

/**
 * Check if a string is a valid 32-character hex string (GUID format)
 * @param {string} value - Value to check
 * @returns {boolean} True if valid hex32 string
 */
export function isHex32(value) {
  if (value === null || value === undefined) return false;
  if (Buffer.isBuffer(value)) {
    // Buffer is valid if it's 16 bytes (32 hex chars)
    return value.length === 16;
  }
  return typeof value === 'string' && REGEX_HEX_32.test(value.replace(/-/g, ''));
}

/**
 * Normalize a hex32 GUID string (uppercase, strip hyphens, trim)
 * Handles various input formats:
 * - "a1b2c3d4e5f6..." (lowercase)
 * - "A1B2C3D4E5F6..." (uppercase)
 * - "a1b2-c3d4-e5f6-..." (with hyphens)
 * - Buffer instances (converts to hex)
 * 
 * @param {string|Buffer} value - Hex string or Buffer to normalize
 * @returns {string} Normalized uppercase hex string (32 chars, no hyphens)
 */
export function normalizeHex32(value) {
  if (value === null || value === undefined) return '';
  if (Buffer.isBuffer(value)) {
    return value.toString('hex').toUpperCase();
  }
  return String(value).trim().replace(/-/g, '').toUpperCase();
}

/**
 * Normalize GUID values from Oracle/API JSON: RAW(16), 32-char hex, optional dashes,
 * or 64-char "double hex" (each pair is ASCII for one character of the real 32-char hex).
 *
 * @param {string|Buffer|null|undefined} value
 * @param {{ uppercase?: boolean }} [options] - defaults to uppercase true for API payloads
 * @returns {string|null}
 */
export function normalizeApiGuidString(value, options = {}) {
  const uppercase = options.uppercase !== false;

  const applyCase = (hex) => (uppercase ? String(hex).toUpperCase() : String(hex));

  if (value == null || value === '') return null;
  if (Buffer.isBuffer(value)) {
    if (value.length === 16) {
      return applyCase(value.toString('hex'));
    }
    if (value.length === 32) {
      const asLatin1 = value.toString('latin1');
      if (REGEX_HEX_32.test(asLatin1)) {
        return applyCase(asLatin1);
      }
    }
    return applyCase(value.toString('hex'));
  }

  const s = String(value).trim();
  if (!s) return null;

  const noDash = s.replace(/-/g, '');
  if (REGEX_HEX_32.test(noDash)) {
    return applyCase(noDash);
  }
  if (REGEX_HEX_64.test(noDash)) {
    try {
      const inner = Buffer.from(noDash, 'hex').toString('latin1');
      if (REGEX_HEX_32.test(inner)) {
        return applyCase(inner);
      }
    } catch (_) {
      /* ignore */
    }
  }
  return s;
}

/**
 * Validate and ensure a value is a valid 32-character hex GUID
 * Normalizes the input and validates the format
 * 
 * @param {string|Buffer} value - Hex string or Buffer to validate
 * @param {string} fieldName - Field name for error message (default: 'guid')
 * @returns {string} Normalized 32-character uppercase hex string
 * @throws {ValidationError} If value is not a valid hex32 GUID
 */
export function ensureHex32(value, fieldName = 'guid') {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} must be a 32-character hex GUID`);
  }
  const viaApi = normalizeApiGuidString(value);
  const compact = viaApi != null ? String(viaApi).replace(/-/g, '') : '';
  let hex = REGEX_HEX_32.test(compact) ? compact.toUpperCase() : normalizeHex32(value);

  // Align with hexToRawBuffer: left-pad when a leading zero was dropped from RAWTOHEX display.
  if (/^[0-9A-F]+$/.test(hex) && hex.length > 0 && hex.length < 32) {
    hex = hex.padStart(32, '0');
  }

  if (!REGEX_HEX_32.test(hex)) {
    throw new ValidationError(`${fieldName} must be a 32-character hex GUID`);
  }
  return hex;
}

/**
 * Convert hex32 string to Buffer for Oracle RAW(16) binding
 * Handles various input formats and normalizes before conversion
 * 
 * @param {string|Buffer} value - Hex string or Buffer to convert
 * @returns {Buffer|null} Buffer (16 bytes) for Oracle RAW(16), or null if input is null/undefined/empty
 * @throws {ValidationError} If value is not a valid hex string (when value is provided)
 */
export function hexToRawBuffer(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // If already a Buffer, validate and return
  if (Buffer.isBuffer(value)) {
    if (value.length === 16) {
      return value; // Already correct size for RAW(16)
    }
    // Convert to hex and process again
    return hexToRawBuffer(value.toString('hex'));
  }

  // Prefer unwrapping double-encoded Oracle JSON GUIDs before plain hex normalization
  const unwrapped = normalizeApiGuidString(value);
  const core = unwrapped != null ? String(unwrapped).replace(/-/g, '') : '';
  const hex = REGEX_HEX_32.test(core) ? core.toUpperCase() : normalizeHex32(value);

  // Validate hex format
  if (!/^[0-9A-F]+$/.test(hex)) {
    throw new ValidationError(`Invalid hex string format: ${value}`);
  }

  // Ensure exactly 32 characters (pad or truncate if needed)
  let h = hex;
  if (h.length < 32) {
    h = h.padStart(32, '0');
  }
  if (h.length > 32) {
    h = h.slice(0, 32);
  }

  try {
    return Buffer.from(h, 'hex'); // Creates 16-byte buffer
  } catch (error) {
    throw new ValidationError(`Failed to convert hex to buffer: ${error.message}`);
  }
}

/**
 * Convert Oracle RAW(16) Buffer to hex string
 * Alias for bufferToHex for consistency
 * 
 * @param {Buffer} buffer - Oracle RAW(16) buffer
 * @returns {string|null} 32-character uppercase hex string, or null if input is null/undefined
 */
export function rawBufferToHex(buffer) {
  return bufferToHex(buffer);
}

/**
 * Convert Oracle RAW(16) Buffer to hex string
 * @param {Buffer|string} buffer - Oracle RAW(16) buffer or hex string
 * @returns {string|null} 32-character uppercase hex string, or null if input is null/undefined
 */
export function bufferToHex(buffer) {
  if (!buffer) return null;
  if (Buffer.isBuffer(buffer)) {
    return buffer.toString('hex').toUpperCase();
  }
  if (typeof buffer === 'string') {
    const fromApi = normalizeApiGuidString(buffer);
    const compact = String(fromApi ?? '').replace(/-/g, '');
    if (REGEX_HEX_32.test(compact)) {
      return compact.toUpperCase();
    }
    const normalized = normalizeHex32(buffer);
    if (isHex32(normalized)) {
      return normalized;
    }
  }
  return buffer;
}

/**
 * Convert hex string to Oracle RAW(16) Buffer
 * Alias for hexToRawBuffer for backward compatibility
 * 
 * @param {string} hexString - 32-character hex string
 * @returns {Buffer} Oracle RAW(16) buffer
 * @deprecated Use hexToRawBuffer instead
 */
export function hexToBuffer(hexString) {
  return hexToRawBuffer(hexString);
}

/**
 * Generate a new SYS_GUID from Oracle database
 * @param {Object} connection - Oracle database connection
 * @returns {Promise<{buffer: Buffer, hex: string}>} Object with buffer and hex string
 * @throws {Error} If GUID generation fails
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
 * Parse and validate GUID from URL parameter or request body
 * Useful for Express route parameters
 * 
 * @param {string} guidParam - GUID parameter from URL or body
 * @param {string} paramName - Parameter name for error messages (default: 'guid')
 * @returns {string} Normalized 32-character uppercase hex string
 * @throws {ValidationError} If GUID format is invalid
 */
export function parseGuid(guidParam, paramName = 'guid') {
  if (!guidParam) {
    throw new ValidationError(`Invalid ${paramName} format`);
  }
  return ensureHex32(guidParam, paramName);
}

/**
 * Convert structure_id Buffer to hex string in an object
 * Recursively processes objects and arrays
 * @param {*} obj - Object, array, or value to process
 * @returns {*} Object with structure_id converted to hex string
 * @deprecated Use convertGuidFieldsToHex instead for more flexibility
 */
export function convertStructureIdToHex(obj) {
  return convertGuidFieldsToHex(obj, ['structure_id']);
}

/**
 * Convert GUID Buffer fields to hex strings in an object
 * Recursively processes objects and arrays
 * 
 * @param {*} obj - Object, array, or value to process
 * @param {string[]} fieldNames - Field names to convert (default: common GUID field names)
 * @returns {*} Object with GUID fields converted to hex strings
 */
export function convertGuidFieldsToHex(obj, fieldNames = [
  'structure_id',
  'org_structure_id',
  'parent_org_unit_id',
  'org_unit_id',
  'department_id',
  'accrual_plan_guid',
  'guid',
  'id' // Generic id field (only if Buffer)
]) {
  if (obj === null || obj === undefined) return obj;
  if (obj instanceof Date) return obj;
  if (Buffer.isBuffer(obj)) {
    // If it's a buffer, convert to hex
    return bufferToHex(obj);
  }
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => convertGuidFieldsToHex(item, fieldNames));
  }

  const converted = {};
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (fieldNames.includes(keyLower) && Buffer.isBuffer(value)) {
      converted[key] = bufferToHex(value);
    } else if (value === null || value === undefined) {
      converted[key] = value;
    } else if (value instanceof Date) {
      converted[key] = value;
    } else if (Buffer.isBuffer(value)) {
      // Convert any Buffer to hex
      converted[key] = bufferToHex(value);
    } else if (typeof value === 'object') {
      converted[key] = convertGuidFieldsToHex(value, fieldNames);
    } else {
      converted[key] = value;
    }
  }
  return converted;
}

/**
 * Format GUID as hex string with hyphens (for display purposes)
 * Format: XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 * 
 * @param {string|Buffer} guid - GUID hex string or Buffer
 * @returns {string} Formatted GUID string with hyphens
 */
export function formatGuidWithHyphens(guid) {
  const hex = normalizeHex32(guid);
  if (!isHex32(hex)) {
    return hex; // Return as-is if not valid
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Remove hyphens from GUID string
 * @param {string} guid - GUID string with or without hyphens
 * @returns {string} GUID string without hyphens
 */
export function removeHyphensFromGuid(guid) {
  return normalizeHex32(guid);
}
