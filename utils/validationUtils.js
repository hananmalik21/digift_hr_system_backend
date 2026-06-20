import { ValidationError } from './errors/index.js';

export function validateActiveFlag(value) {
  if (value === undefined || value === null || value === '') return;
  const flag = String(value).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    throw new ValidationError('active_flag must be Y or N.');
  }
}

export function validateDisplaySequence(value) {
  if (value === undefined || value === null || value === '') return;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new ValidationError('display_sequence must be numeric.');
  }
}

/**
 * @param {unknown} raw
 * @returns {'Y'|'N'|null}
 */
export function parseOptionalActiveFlag(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const flag = String(raw).trim().toUpperCase();
  if (flag !== 'Y' && flag !== 'N') {
    throw new ValidationError('active_flag must be Y or N.');
  }
  return flag;
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 */
export function requireNonEmptyString(value, fieldName) {
  if (!value || (typeof value === 'string' && value.trim() === '')) {
    throw new ValidationError(`${fieldName} is required.`);
  }
}
