import { ValidationError } from '../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../utils/guidUtils.js';

export function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

export function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
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
