import {
  asObject,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateRequiredEmailInErrors,
  validateRequiredPasswordInErrors
} from '../../shared/recValidationUtils.js';

/**
 * @param {Record<string, unknown>} body
 */
export function validateCandidateLoginBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateRequiredEmailInErrors(errors, b);
  validateRequiredPasswordInErrors(errors, b);

  throwIfValidationErrors(errors);
}
