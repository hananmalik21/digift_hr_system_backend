import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '@digifyhr/common';

const CHECK_TYPES = new Set(['STANDARD', 'COMPREHENSIVE']);
const PRIORITIES = new Set(['STANDARD', 'HIGH', 'URGENT']);

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
}

function requireField(errors, body, field, label = field) {
  if (isBlank(body[field])) errors.push(`${label} is required`);
}

function requirePositiveEnterpriseId(errors, body) {
  if (isBlank(body.enterprise_id)) {
    errors.push('enterprise_id is required');
    return;
  }
  const n = Number(body.enterprise_id);
  if (!Number.isFinite(n) || n <= 0) {
    errors.push('enterprise_id must be a positive number');
  }
}

function requireYnFlag(errors, body, field, label = field) {
  if (isBlank(body[field])) {
    errors.push(`${label} is required`);
    return;
  }
  const s = String(body[field]).trim().toUpperCase();
  if (s !== 'Y' && s !== 'N') {
    errors.push(`${label} must be Y or N`);
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export function validateCreateBackgroundCheckBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  requireField(errors, b, 'candidate_guid');
  requireField(errors, b, 'provider');
  requireField(errors, b, 'check_type');
  requireField(errors, b, 'priority');
  requireField(errors, b, 'created_by');
  requireYnFlag(errors, b, 'consent_obtained_flag');

  if (!isBlank(b.candidate_guid)) {
    try {
      ensureHex32(normalizeHex32(b.candidate_guid));
    } catch {
      errors.push('candidate_guid must be a valid 32-character hex GUID');
    }
  }

  if (!isBlank(b.check_type)) {
    const ct = String(b.check_type).trim().toUpperCase();
    if (!CHECK_TYPES.has(ct)) {
      errors.push('check_type must be STANDARD or COMPREHENSIVE');
    }
  }

  if (!isBlank(b.priority)) {
    const pr = String(b.priority).trim().toUpperCase();
    if (!PRIORITIES.has(pr)) {
      errors.push('priority must be STANDARD, HIGH, or URGENT');
    }
  }

  if (!isBlank(b.consent_obtained_flag)) {
    const consent = String(b.consent_obtained_flag).trim().toUpperCase();
    if (consent !== 'Y') {
      errors.push('consent_obtained_flag must be Y to initiate a background check');
    }
  }

  const optionalFlags = [
    'employment_ver_flag',
    'education_ver_flag',
    'criminal_record_flag',
    'credit_check_flag',
    'drug_testing_flag'
  ];
  for (const field of optionalFlags) {
    if (!isBlank(b[field])) {
      const s = String(b[field]).trim().toUpperCase();
      if (s !== 'Y' && s !== 'N') {
        errors.push(`${field} must be Y or N`);
      }
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

/**
 * Normalize enum fields to uppercase before Oracle bind.
 * @param {Record<string, unknown>} body
 */
export function normalizeBackgroundCheckBody(body) {
  const b = asObject(body);
  if (!isBlank(b.check_type)) b.check_type = String(b.check_type).trim().toUpperCase();
  if (!isBlank(b.priority)) b.priority = String(b.priority).trim().toUpperCase();
  for (const field of [
    'employment_ver_flag',
    'education_ver_flag',
    'criminal_record_flag',
    'credit_check_flag',
    'drug_testing_flag',
    'consent_obtained_flag'
  ]) {
    if (!isBlank(b[field])) b[field] = String(b[field]).trim().toUpperCase();
  }
  if (!isBlank(b.candidate_guid)) {
    b.candidate_guid = ensureHex32(normalizeHex32(b.candidate_guid));
  }
  return b;
}
