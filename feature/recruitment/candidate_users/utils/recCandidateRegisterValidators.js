import {
  asObject,
  isBlank,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateOptionalNumberInErrors,
  validateRequiredEmailInErrors,
  validateRequiredPasswordInErrors
} from '../../shared/recValidationUtils.js';
import { validateCandidateProfileFieldsInErrors } from '../../candidates/utils/recCandidateProfileValidation.js';
import { PORTAL_MIN_PASSWORD_LENGTH } from './recCandidatePortalConstants.js';

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

  validateCandidateProfileFieldsInErrors(errors, b);
  validateOptionalNumberInErrors(errors, b, 'expected_salary');

  throwIfValidationErrors(errors);
}
