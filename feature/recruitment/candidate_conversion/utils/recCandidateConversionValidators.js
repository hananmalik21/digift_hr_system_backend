import { AppError } from '../../../../utils/errors/index.js';
import {
  DEFAULT_PROBATION_DAYS,
  DEFAULT_SEND_NOTIFICATION,
  DEFAULT_TRIGGER_ONBOARDING,
  ERROR_CODES,
  HR_CONTACT_ID_MAX_LENGTH,
  HR_CONTACT_REQUIRED_MESSAGE,
  INVALID_BOOLEAN_MESSAGE,
  INVALID_CANDIDATE_GUID_MESSAGE,
  INVALID_OFFER_GUID_MESSAGE,
  INVALID_PROBATION_DAYS_MESSAGE,
  INVALID_TRANSFER_NOTES_MESSAGE,
  TRANSFER_NOTES_MAX_LENGTH
} from './recCandidateConversionConstants.js';

/** Exactly 32 hexadecimal characters. */
export const HEX32_REGEX = /^[A-Fa-f0-9]{32}$/;

function throwBadRequest(code, message) {
  throw new AppError(message, 400, code);
}

/**
 * @param {unknown} value
 * @param {string} code
 * @param {string} message
 * @returns {string}
 */
export function parseHex32Guid(value, code, message) {
  if (value == null || String(value).trim() === '') {
    throwBadRequest(code, message);
  }
  const hex = String(value).trim();
  if (!HEX32_REGEX.test(hex)) {
    throwBadRequest(code, message);
  }
  return hex.toUpperCase();
}

/** @param {unknown} value @returns {string} */
export function parseConversionOfferGuid(value) {
  return parseHex32Guid(value, ERROR_CODES.INVALID_OFFER_GUID, INVALID_OFFER_GUID_MESSAGE);
}

/** @param {unknown} value @returns {string} */
export function parseConversionCandidateGuid(value) {
  return parseHex32Guid(value, ERROR_CODES.INVALID_CANDIDATE_GUID, INVALID_CANDIDATE_GUID_MESSAGE);
}

function throwInvalidProbationDays() {
  throwBadRequest(ERROR_CODES.INVALID_PROBATION_DAYS, INVALID_PROBATION_DAYS_MESSAGE);
}

/**
 * Optional body.probation_days; omitted/null/blank → 0. Must be an integer >= 0.
 *
 * @param {unknown} body
 * @returns {number}
 */
export function parseProbationDays(body) {
  const raw =
    body && typeof body === 'object' && !Array.isArray(body) ? body.probation_days : undefined;
  if (raw === undefined || raw === null || raw === '') {
    return DEFAULT_PROBATION_DAYS;
  }
  if (typeof raw === 'boolean' || typeof raw === 'object') {
    throwInvalidProbationDays();
  }
  if (typeof raw === 'string' && !/^\d+$/.test(String(raw).trim())) {
    throwInvalidProbationDays();
  }
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throwInvalidProbationDays();
  }
  return n;
}

/**
 * Package CHAR/VARCHAR2 Y/N → JSON boolean.
 * @param {unknown} value
 * @returns {boolean}
 */
export function ynToBoolean(value) {
  return String(value ?? '').trim().toUpperCase() === 'Y';
}

/**
 * JSON boolean → Oracle CHAR Y/N. Never pass true/false to CHAR binds.
 * @param {boolean} value
 * @returns {'Y'|'N'}
 */
export function booleanToYn(value) {
  return value === true ? 'Y' : 'N';
}

/**
 * @param {unknown} value
 * @param {boolean} defaultValue
 * @param {string} field
 * @returns {boolean}
 */
export function parseOptionalBoolean(value, defaultValue, field) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === 0) return value === 1;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === 'true' || s === 'y' || s === '1') return true;
    if (s === 'false' || s === 'n' || s === '0') return false;
  }
  throwBadRequest(ERROR_CODES.TRANSFER_FAILED, `${field} ${INVALID_BOOLEAN_MESSAGE}`);
}

/**
 * Optional HR contact id. Blank → null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseOptionalHrContactId(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = String(value).trim();
  if (!id) return null;
  if (id.length > HR_CONTACT_ID_MAX_LENGTH) {
    throwBadRequest(
      ERROR_CODES.TRANSFER_FAILED,
      `hr_contact_id must be ${HR_CONTACT_ID_MAX_LENGTH} characters or fewer.`
    );
  }
  return id;
}

/**
 * Optional transfer notes. Blank → null. Max 4000.
 * @param {unknown} value
 * @returns {string|null}
 */
export function parseOptionalTransferNotes(value) {
  if (value === undefined || value === null) return null;
  const notes = String(value);
  if (notes.trim() === '') return null;
  if (notes.length > TRANSFER_NOTES_MAX_LENGTH) {
    throwBadRequest(ERROR_CODES.TRANSFER_FAILED, INVALID_TRANSFER_NOTES_MESSAGE);
  }
  return notes;
}

/**
 * Transfer-to-HR body. Ignores derived employee/assignment fields.
 *
 * @param {unknown} body
 * @returns {{
 *   probation_days: number,
 *   hr_contact_id: string|null,
 *   transfer_notes: string|null,
 *   send_notification: boolean,
 *   trigger_onboarding: boolean
 * }}
 */
export function parseTransferToHrBody(body) {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const probation_days = parseProbationDays(raw);
  const send_notification = parseOptionalBoolean(
    raw.send_notification,
    DEFAULT_SEND_NOTIFICATION,
    'send_notification'
  );
  const trigger_onboarding = parseOptionalBoolean(
    raw.trigger_onboarding,
    DEFAULT_TRIGGER_ONBOARDING,
    'trigger_onboarding'
  );
  const hr_contact_id = parseOptionalHrContactId(raw.hr_contact_id);
  const transfer_notes = parseOptionalTransferNotes(raw.transfer_notes);

  if (send_notification && !hr_contact_id) {
    throwBadRequest(ERROR_CODES.HR_CONTACT_REQUIRED, HR_CONTACT_REQUIRED_MESSAGE);
  }

  return {
    probation_days,
    hr_contact_id,
    transfer_notes,
    send_notification,
    trigger_onboarding
  };
}
