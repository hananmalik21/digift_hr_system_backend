import {
  asObject,
  parseHexGuidParam,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors,
  validateOptionalMaxLengthInErrors,
  validateOptionalNumberInErrors,
  validateOptionalYnInErrors
} from '../../shared/recValidationUtils.js';
import { CANDIDATE_LINK_MAX_LEN } from './recCandidateProfileFields.js';

export function parseCandidateGuidParam(value) {
  return parseHexGuidParam(value, {
    requiredMessage: 'candidate_guid is required',
    invalidMessage: 'candidate_guid must be a valid 32-character hex GUID'
  });
}

const PROFILE_LINK_FIELDS = ['portfolio_link', 'github_link', 'linkedin_profile'];

function validateCandidateProfileFields(errors, body) {
  validateOptionalYnInErrors(errors, body, 'willing_to_relocate');
  validateOptionalNumberInErrors(errors, body, 'current_salary');
  for (const field of PROFILE_LINK_FIELDS) {
    validateOptionalMaxLengthInErrors(errors, body, field, CANDIDATE_LINK_MAX_LEN);
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
    validateHexGuidInErrors(errors, candidateGuid ?? b.candidate_guid, 'candidate_guid');
  }

  validateCandidateProfileFields(errors, b);

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} [candidateGuid]
 */
export function validateCandidateDeleteBody(body, candidateGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, candidateGuid ?? b.candidate_guid, 'candidate_guid');

  throwIfValidationErrors(errors);
}
