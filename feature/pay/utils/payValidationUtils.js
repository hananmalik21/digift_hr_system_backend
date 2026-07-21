import { ForbiddenError, ValidationError } from '../../../utils/errors/index.js';
import { getActingEnterpriseId } from '../../../utils/userContext.js';
import { parseEnterpriseId } from '../../../utils/tenantUtils.js';

export function throwIfErrors(errors) {
  if (errors.length === 0) return;
  throw new ValidationError('Validation failed', errors);
}

export function isBlank(value) {
  return value == null || String(value).trim() === '';
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

export function parseEnterpriseIdField(errors, raw, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push('enterprise_id is required');
    return null;
  }
  try {
    return parseEnterpriseId(raw, { required, missingMessage: 'enterprise_id is required' });
  } catch (err) {
    errors.push(err.message);
    return null;
  }
}

export function parseUppercaseCode(errors, raw, field, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return defaultValue;
  }
  return String(raw).trim().toUpperCase();
}

export function parseOptionalText(raw) {
  if (isBlank(raw)) return null;
  return String(raw).trim();
}

export function parseRequiredText(errors, raw, field) {
  if (isBlank(raw)) {
    errors.push(`${field} is required`);
    return null;
  }
  return String(raw).trim();
}

export function parseDateField(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const s = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    errors.push(`${field} must be a valid date in YYYY-MM-DD format`);
    return null;
  }
  return s;
}

export function parseYnFlag(errors, raw, field, { required = false, defaultValue = null } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return defaultValue;
  }
  const value = String(raw).trim().toUpperCase();
  if (value !== 'Y' && value !== 'N') {
    errors.push(`${field} must be Y or N`);
    return null;
  }
  return value;
}

export function parsePositiveInteger(errors, raw, field, { required = false } = {}) {
  if (isBlank(raw)) {
    if (required) errors.push(`${field} is required`);
    return null;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    errors.push(`${field} must be a positive integer`);
    return null;
  }
  return n;
}

export function assertEnterpriseAccess(req, enterpriseId) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && enterpriseId != null && tokenEnterpriseId !== enterpriseId) {
    throw new ForbiddenError('Access denied: enterprise_id does not match authenticated enterprise');
  }
}
