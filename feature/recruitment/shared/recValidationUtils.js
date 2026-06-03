import { ValidationError } from '../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../utils/guidUtils.js';

export function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

export function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export function normalizeEmailLower(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {number} [minLen] */
export function validateRequiredPasswordInErrors(errors, body, minLen = 8) {
  if (isBlank(body.password)) {
    errors.push('password is required');
    return;
  }
  if (String(body.password).length < minLen) {
    errors.push(`password must be at least ${minLen} characters`);
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body */
export function validateRequiredEmailInErrors(errors, body) {
  if (isBlank(body.email)) {
    errors.push('email is required');
  }
}

export function requirePositiveEnterpriseId(errors, body) {
  if (isBlank(body.enterprise_id)) {
    errors.push('enterprise_id is required');
    return;
  }
  const n = Number(body.enterprise_id);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push('enterprise_id must be a positive number');
  }
}

export function requireNonBlankString(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
  }
}

/** Alias used by candidate sub-validators. */
export const requireField = requireNonBlankString;

export function validateHexGuidInErrors(errors, guid, fieldName) {
  if (isBlank(guid)) {
    errors.push(`${fieldName} is required`);
    return;
  }
  try {
    ensureHex32(normalizeHex32(guid));
  } catch {
    errors.push(`${fieldName} must be a valid 32-character hex GUID`);
  }
}

export function throwIfValidationErrors(errors) {
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
export function validateOptionalYnInErrors(errors, body, field) {
  if (isBlank(body[field])) return;
  const u = String(body[field]).trim().toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    errors.push(`${field} must be Y or N`);
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
export function validateOptionalNumberInErrors(errors, body, field) {
  if (isBlank(body[field])) return;
  const n = Number(body[field]);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a valid number`);
  }
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 * @param {number} [maxLen]
 */
export function validateOptionalMaxLengthInErrors(errors, body, field, maxLen = 1000) {
  if (body[field] === undefined || body[field] === null) return;
  const s = String(body[field]).trim();
  if (!s) return;
  if (s.length > maxLen) {
    errors.push(`${field} must not exceed ${maxLen} characters`);
  }
}

/**
 * @param {unknown} value
 * @param {{ requiredMessage: string, invalidMessage: string }} messages
 * @returns {string}
 */
export function parseHexGuidParam(value, messages) {
  if (isBlank(value)) {
    throw new ValidationError('Validation failed', [messages.requiredMessage]);
  }
  try {
    return ensureHex32(normalizeHex32(value));
  } catch {
    throw new ValidationError('Validation failed', [messages.invalidMessage]);
  }
}
