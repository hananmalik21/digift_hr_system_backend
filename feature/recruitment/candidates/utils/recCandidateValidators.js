import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function asObject(body) {
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
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

/**
 * @param {unknown} value
 * @returns {string}
 */
export function parseCandidateGuidParam(value) {
  if (isBlank(value)) {
    throw new ValidationError('Validation failed', ['candidate_guid is required']);
  }
  try {
    return ensureHex32(normalizeHex32(value));
  } catch {
    throw new ValidationError('Validation failed', ['candidate_guid must be a valid 32-character hex GUID']);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ isUpdate?: boolean, candidateGuid?: string }} [options]
 */
export function validateCandidateBody(body, options = {}) {
  const b = asObject(body);
  const errors = [];
  const { isUpdate = false, candidateGuid } = options;

  requirePositiveEnterpriseId(errors, b);

  if (isUpdate) {
    const guid = candidateGuid ?? b.candidate_guid;
    if (isBlank(guid)) {
      errors.push('candidate_guid is required');
    } else {
      try {
        ensureHex32(normalizeHex32(guid));
      } catch {
        errors.push('candidate_guid must be a valid 32-character hex GUID');
      }
    }
  }

  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}
