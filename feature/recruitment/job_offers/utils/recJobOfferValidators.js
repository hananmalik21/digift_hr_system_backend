import { ensureHex32, normalizeHex32 } from '@digifyhr/common';
import {
  asObject,
  isBlank,
  parseHexGuidParam,
  requireNonBlankString,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';

const OFFER_GUID_MESSAGES = {
  requiredMessage: 'offer_guid is required',
  invalidMessage: 'offer_guid must be a valid 32-character hex GUID'
};

/** @param {unknown} value @returns {string} */
export function parseOfferGuidParam(value) {
  return parseHexGuidParam(value, OFFER_GUID_MESSAGES);
}

/** @param {string[]} errors @param {unknown} guid @param {string} fieldName */
function validateOptionalHexGuidInErrors(errors, guid, fieldName) {
  if (isBlank(guid)) return;
  try {
    ensureHex32(normalizeHex32(guid));
  } catch {
    errors.push(`${fieldName} must be a valid 32-character hex GUID`);
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
function validateArrayTypeInErrors(errors, body, field) {
  const value = body[field];
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
  }
}

/** @param {string[]} errors @param {Record<string, unknown>} body @param {string} field */
function validateObjectTypeInErrors(errors, body, field) {
  const value = body[field];
  if (value === undefined || value === null) return;
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push(`${field} must be an object`);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Record<string, unknown>}
 */
export function validateCreateJobOfferBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, b.application_guid, 'application_guid');
  validateHexGuidInErrors(errors, b.candidate_guid, 'candidate_guid');

  if (isBlank(b.posting_id)) {
    errors.push('posting_id is required');
  } else {
    const n = Number(b.posting_id);
    if (!Number.isFinite(n) || n <= 0) {
      errors.push('posting_id must be a positive number');
    }
  }

  requireNonBlankString(errors, b, 'job_title');
  requireNonBlankString(errors, b, 'start_date');
  requireNonBlankString(errors, b, 'created_by');

  validateOptionalHexGuidInErrors(errors, b.position_id, 'position_id');
  validateOptionalHexGuidInErrors(errors, b.department_id, 'department_id');
  if (b.location !== undefined && b.location !== null && typeof b.location !== 'string') {
    errors.push('location must be a string');
  }

  validateArrayTypeInErrors(errors, b, 'components');
  validateObjectTypeInErrors(errors, b, 'benefits');
  validateObjectTypeInErrors(errors, b, 'terms');

  throwIfValidationErrors(errors);

  return {
    ...b,
    application_guid: ensureHex32(normalizeHex32(b.application_guid)),
    candidate_guid: ensureHex32(normalizeHex32(b.candidate_guid)),
    position_id: isBlank(b.position_id) ? null : ensureHex32(normalizeHex32(b.position_id)),
    department_id: isBlank(b.department_id) ? null : ensureHex32(normalizeHex32(b.department_id)),
    location: isBlank(b.location) ? null : String(b.location).trim()
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} offerGuidHex
 */
export function validateDeclineOfferBody(body, offerGuidHex) {
  const b = asObject(body);
  const errors = [];

  validateHexGuidInErrors(errors, offerGuidHex, 'offer_guid');
  requireNonBlankString(errors, b, 'decline_comments');
  requireNonBlankString(errors, b, 'updated_by');

  throwIfValidationErrors(errors);

  return {
    ...b,
    offer_guid: offerGuidHex,
    decline_comments: String(b.decline_comments).trim(),
    updated_by: String(b.updated_by).trim()
  };
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} offerGuidHex
 */
export function validateOfferActionBody(body, offerGuidHex) {
  const b = asObject(body);
  const errors = [];

  validateHexGuidInErrors(errors, offerGuidHex, 'offer_guid');
  requireNonBlankString(errors, b, 'updated_by');

  throwIfValidationErrors(errors);

  return {
    ...b,
    offer_guid: offerGuidHex,
    updated_by: String(b.updated_by).trim()
  };
}
