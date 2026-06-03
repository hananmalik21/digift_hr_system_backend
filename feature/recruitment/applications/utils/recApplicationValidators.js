import {
  asObject,
  parseHexGuidParam,
  requireNonBlankString,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors,
  validateOptionalMaxLengthInErrors,
  validateOptionalYnInErrors,
  validateRequiredCodeInErrors
} from '../../shared/recValidationUtils.js';
import {
  NOTE_TEXT_MAX_LEN,
  REJECT_ERROR_REASON_REQUIRED,
  REJECTION_COMMENTS_MAX_LEN,
  VALID_NOTE_TYPE_CODES,
  VALID_REJECTION_REASON_CODES,
  TEXT_FIELD_MAX_LEN,
  VALID_STAGE_CODES
} from './recApplicationConstants.js';

const APPLICATION_GUID_MESSAGES = {
  requiredMessage: 'application_guid is required',
  invalidMessage: 'application_guid must be a valid 32-character hex GUID'
};

const CANDIDATE_GUID_MESSAGES = {
  requiredMessage: 'candidate_guid is required',
  invalidMessage: 'candidate_guid must be a valid 32-character hex GUID'
};

const NOTE_GUID_MESSAGES = {
  requiredMessage: 'note_guid is required',
  invalidMessage: 'note_guid must be a valid 32-character hex GUID'
};

export function parseApplicationGuidParam(value) {
  return parseHexGuidParam(value, APPLICATION_GUID_MESSAGES);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} postingGuidHex
 */
export function validateApplyJobBody(body, postingGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, postingGuidHex, 'posting_guid');
  validateHexGuidInErrors(errors, b.candidate_guid, 'candidate_guid');
  requireNonBlankString(errors, b, 'source_code');
  requireNonBlankString(errors, b, 'created_by');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export function validateChangeStageBody(body, applicationGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, applicationGuidHex, 'application_guid');
  validateRequiredCodeInErrors(errors, b, 'current_stage_code', VALID_STAGE_CODES);
  requireNonBlankString(errors, b, 'updated_by');
  validateOptionalMaxLengthInErrors(errors, b, 'comments', TEXT_FIELD_MAX_LEN);

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export function validateRejectApplicationBody(body, applicationGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, applicationGuidHex, 'application_guid');
  requireNonBlankString(errors, b, 'rejected_by');

  validateRequiredCodeInErrors(errors, b, 'rejection_reason_code', VALID_REJECTION_REASON_CODES, {
    requiredMessage: REJECT_ERROR_REASON_REQUIRED
  });

  validateOptionalMaxLengthInErrors(errors, b, 'rejection_comments', REJECTION_COMMENTS_MAX_LEN);
  requireNonBlankString(errors, b, 'send_email_flag');
  validateOptionalYnInErrors(errors, b, 'send_email_flag');

  throwIfValidationErrors(errors);
}

export function parseNoteGuidParam(value) {
  return parseHexGuidParam(value, NOTE_GUID_MESSAGES);
}

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
function validateApplicationNoteWriteFields(errors, body) {
  validateRequiredCodeInErrors(errors, body, 'note_type_code', VALID_NOTE_TYPE_CODES);
  requireNonBlankString(errors, body, 'note_text');
  validateOptionalMaxLengthInErrors(errors, body, 'note_text', NOTE_TEXT_MAX_LEN);
  requireNonBlankString(errors, body, 'private_flag');
  validateOptionalYnInErrors(errors, body, 'private_flag');
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export function validateAddApplicationNoteBody(body, applicationGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, applicationGuidHex, 'application_guid');
  validateApplicationNoteWriteFields(errors, b);
  requireNonBlankString(errors, b, 'created_by');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} noteGuidHex
 */
export function validateUpdateApplicationNoteBody(body, noteGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, noteGuidHex, 'note_guid');
  validateApplicationNoteWriteFields(errors, b);
  requireNonBlankString(errors, b, 'last_updated_by');

  throwIfValidationErrors(errors);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} noteGuidHex
 */
export function validateDeleteApplicationNoteBody(body, noteGuidHex) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, noteGuidHex, 'note_guid');

  throwIfValidationErrors(errors);
}

