import { ValidationError } from '../../../utils/errors/index.js';
import {
  isFutureDateOnly,
  isValidCalendarDateOnly,
  parseCalendarDateOnlyBind
} from '@digifyhr/common';
import { ensureHex32, normalizeHex32 } from '@digifyhr/common';

export { isFutureDateOnly, isValidCalendarDateOnly, parseCalendarDateOnlyBind };

export const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

export function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

export function normalizeEmailLower(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

/** @param {string} email */
export function isValidBasicEmail(email) {
  return BASIC_EMAIL_RE.test(String(email ?? '').trim());
}

/**
 * Trim optional string field on body; blank values become null when the key was sent.
 * @param {Record<string, unknown>} body
 * @param {string} field
 */
export function normalizeOptionalTrimmedField(body, field) {
  if (!isBlank(body[field])) {
    body[field] = String(body[field]).trim();
    return;
  }
  if (body[field] !== undefined && body[field] !== null) {
    body[field] = null;
  }
}

/**
 * Uppercase optional code-style field on body; blank values become null when the key was sent.
 * @param {Record<string, unknown>} body
 * @param {string} field
 */
export function normalizeOptionalUppercaseCode(body, field) {
  if (!isBlank(body[field])) {
    body[field] = String(body[field]).trim().toUpperCase();
    return;
  }
  if (body[field] !== undefined && body[field] !== null) {
    body[field] = null;
  }
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 * @param {{ notFuture?: boolean }} [options]
 */
export function validateOptionalCalendarDateInErrors(errors, body, field, options = {}) {
  const { notFuture = false } = options;
  if (isBlank(body[field])) {
    if (body[field] !== undefined && body[field] !== null) body[field] = null;
    return;
  }
  const s = String(body[field]).trim();
  if (!isValidCalendarDateOnly(s)) {
    errors.push(`${field} must be a valid date (YYYY-MM-DD)`);
    return;
  }
  if (notFuture && isFutureDateOnly(s)) {
    errors.push(`${field} must not be a future date`);
    return;
  }
  body[field] = s;
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 */
export function validateOptionalEmailInErrors(errors, body, field) {
  if (isBlank(body[field])) {
    if (body[field] !== undefined && body[field] !== null) body[field] = null;
    return;
  }
  const email = normalizeEmailLower(body[field]);
  if (!isValidBasicEmail(email)) {
    errors.push(`${field} must be a valid email address`);
    return;
  }
  body[field] = email;
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

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 * @param {string} field
 * @param {string[]} allowed
 * @param {{ requiredMessage?: string, label?: string }} [options]
 */
export function validateRequiredCodeInErrors(errors, body, field, allowed, options = {}) {
  const label = options.label ?? field;
  if (isBlank(body[field])) {
    errors.push(options.requiredMessage ?? `${label} is required`);
    return;
  }
  const code = String(body[field]).trim().toUpperCase();
  if (!allowed.includes(code)) {
    errors.push(`${label} must be one of: ${allowed.join(', ')}`);
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

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
export function validateOptionalNonNegativeNumberInErrors(errors, body, field) {
  if (isBlank(body[field])) return;
  const n = Number(body[field]);
  if (!Number.isFinite(n)) {
    errors.push(`${field} must be a valid number`);
    return;
  }
  if (n < 0) {
    errors.push(`${field} must be greater than or equal to 0`);
  }
}

/**
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidHttpUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
export function validateOptionalUrlInErrors(errors, body, field) {
  if (body[field] === undefined || body[field] === null) return;
  const s = String(body[field]).trim();
  if (!s) return;
  if (!isValidHttpUrl(s)) {
    errors.push(`${field} must be a valid URL (http or https)`);
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
