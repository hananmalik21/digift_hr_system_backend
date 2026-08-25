import {
  asObject,
  parseHexGuidParam,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';
import { validateCandidateProfileFieldsInErrors } from './recCandidateProfileValidation.js';

export { validateSendCandidateEmailBody } from './recCandidateSendEmailValidators.js';
export { ALLOWED_MESSAGE_TYPES } from './recCandidateSendEmailConstants.js';

export function parseCandidateGuidParam(value) {
  return parseHexGuidParam(value, {
    requiredMessage: 'candidate_guid is required',
    invalidMessage: 'candidate_guid must be a valid 32-character hex GUID'
  });
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

  validateCandidateProfileFieldsInErrors(errors, b);

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
