import {
  validateOptionalMaxLengthInErrors,
  validateOptionalNonNegativeNumberInErrors,
  validateOptionalUrlInErrors,
  validateOptionalYnInErrors
} from '../../shared/recValidationUtils.js';
import { CANDIDATE_LINK_MAX_LEN } from './recCandidateProfileFields.js';

const PROFILE_URL_FIELDS = ['portfolio_link', 'github_link'];
const PROFILE_LINK_FIELDS = [...PROFILE_URL_FIELDS, 'linkedin_profile'];

/**
 * Shared validation for candidate profile / compensation fields.
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateProfileFieldsInErrors(errors, body) {
  validateOptionalYnInErrors(errors, body, 'willing_to_relocate');
  validateOptionalNonNegativeNumberInErrors(errors, body, 'current_salary');
  for (const field of PROFILE_URL_FIELDS) {
    validateOptionalUrlInErrors(errors, body, field);
    validateOptionalMaxLengthInErrors(errors, body, field, CANDIDATE_LINK_MAX_LEN);
  }
  validateOptionalMaxLengthInErrors(errors, body, 'linkedin_profile', CANDIDATE_LINK_MAX_LEN);
}

export { PROFILE_LINK_FIELDS };
