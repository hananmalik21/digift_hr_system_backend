import { AppError } from '../../../../utils/errors/index.js';
import {
  DEFAULT_PROBATION_DAYS,
  ERROR_CODES,
  INVALID_CANDIDATE_GUID_MESSAGE,
  INVALID_OFFER_GUID_MESSAGE,
  INVALID_PROBATION_DAYS_MESSAGE
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
