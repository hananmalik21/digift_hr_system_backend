import {
  asObject,
  isBlank,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateOptionalMaxLengthInErrors,
  validateOptionalNumberInErrors,
  validateOptionalYnInErrors,
  validateRequiredEmailInErrors,
  validateRequiredPasswordInErrors
} from '../../shared/recValidationUtils.js';
import { CANDIDATE_LINK_MAX_LEN } from '../../candidates/utils/recCandidateProfileFields.js';
import { PORTAL_MIN_PASSWORD_LENGTH } from './recCandidatePortalConstants.js';

const PROFILE_LINK_FIELDS = ['portfolio_link', 'github_link', 'linkedin_profile'];

/**
 * @param {Record<string, unknown>} body
 */
export function validateRegisterCandidateUserBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateRequiredEmailInErrors(errors, b);
  validateRequiredPasswordInErrors(errors, b, PORTAL_MIN_PASSWORD_LENGTH);

  if (isBlank(b.first_name)) errors.push('first_name is required');
  if (isBlank(b.last_name)) errors.push('last_name is required');
  if (isBlank(b.phone)) errors.push('phone is required');

  validateOptionalYnInErrors(errors, b, 'willing_to_relocate');
  validateOptionalNumberInErrors(errors, b, 'current_salary');
  validateOptionalNumberInErrors(errors, b, 'expected_salary');
  for (const field of PROFILE_LINK_FIELDS) {
    validateOptionalMaxLengthInErrors(errors, b, field, CANDIDATE_LINK_MAX_LEN);
  }

  throwIfValidationErrors(errors);
}
