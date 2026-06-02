import { ValidationError } from '../../../../utils/errors/index.js';
import { ensureHex32, normalizeHex32 } from '../../../../utils/guidUtils.js';
import { isBlank } from '../../shared/recValidationUtils.js';
import {
  parseEnterpriseIdFromQuery,
  parseListPagination
} from '../../shared/recViewQueryValidators.js';

export { parseEnterpriseIdFromQuery, parseListPagination as parseCandidateListPagination };

/**
 * @param {unknown} resumeGuidParam
 * @returns {string}
 */
export function parseResumeGuidParam(resumeGuidParam) {
  if (isBlank(resumeGuidParam)) {
    throw new ValidationError('Validation failed', ['resume_guid is required']);
  }
  try {
    return ensureHex32(normalizeHex32(resumeGuidParam));
  } catch {
    throw new ValidationError('Validation failed', ['resume_guid must be a valid 32-character hex GUID']);
  }
}

/**
 * @param {unknown} candidateGuidParam
 * @param {unknown} enterpriseIdQuery
 * @returns {{ candidate_guid: string, enterprise_id: number }}
 */
export function validateCandidateGuidEnterpriseParams(candidateGuidParam, enterpriseIdQuery) {
  const errors = [];
  let candidate_guid = null;
  try {
    candidate_guid = ensureHex32(normalizeHex32(candidateGuidParam));
  } catch {
    errors.push('candidate_guid must be a valid 32-character hex GUID');
  }
  if (isBlank(enterpriseIdQuery)) {
    errors.push('enterprise_id query parameter is required');
  } else {
    const eid = Number(enterpriseIdQuery);
    if (!Number.isFinite(eid) || eid <= 0) {
      errors.push('enterprise_id must be a positive number');
    }
  }
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
  return {
    candidate_guid,
    enterprise_id: Number(enterpriseIdQuery)
  };
}
