import {
  normalizeOptionalTrimmedField,
  normalizeOptionalUppercaseCode,
  validateOptionalCalendarDateInErrors,
  validateOptionalEmailInErrors,
  validateOptionalMaxLengthInErrors,
  validateOptionalNonNegativeNumberInErrors,
  validateOptionalUrlInErrors,
  validateOptionalYnInErrors
} from '../../shared/recValidationUtils.js';
import { CANDIDATE_DEMOGRAPHIC_TRIM_FIELDS, CANDIDATE_LINK_MAX_LEN } from './recCandidateProfileFields.js';

const PROFILE_URL_FIELDS = ['portfolio_link', 'github_link'];
const PROFILE_LINK_FIELDS = [...PROFILE_URL_FIELDS, 'linkedin_profile'];

/** @deprecated Use parseCalendarDateOnlyBind from shared utils. */
export { parseCalendarDateOnlyBind as parseDobDateBind } from '../../../../utils/dateOnlyUtils.js';
export {
  isFutureDateOnly,
  isValidCalendarDateOnly
} from '../../../../utils/dateOnlyUtils.js';

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

/**
 * Optional demographic / alternate-contact fields (dob, gender, nationality, etc.).
 * Normalizes values on the body when valid so binds can use them directly.
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
export function validateCandidateDemographicFieldsInErrors(errors, body) {
  validateOptionalCalendarDateInErrors(errors, body, 'dob', { notFuture: true });
  validateOptionalEmailInErrors(errors, body, 'alternate_email');
  normalizeOptionalUppercaseCode(body, 'gender');
  normalizeOptionalTrimmedField(body, 'alternate_phone');

  for (const field of CANDIDATE_DEMOGRAPHIC_TRIM_FIELDS) {
    normalizeOptionalTrimmedField(body, field);
  }
}

export { PROFILE_LINK_FIELDS };
