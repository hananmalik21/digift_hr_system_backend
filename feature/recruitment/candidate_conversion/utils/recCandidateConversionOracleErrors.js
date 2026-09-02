import { AppError } from '../../../../utils/errors/index.js';
import {
  ERROR_CODES,
  GENERIC_ERROR_MESSAGE,
  GENERIC_TRANSFER_ERROR_MESSAGE
} from './recCandidateConversionConstants.js';

const APPLICATION_ERROR_MIN = 20000;
const APPLICATION_ERROR_MAX = 20999;

/** @param {RegExp} pattern @param {number} statusCode @param {string} code */
function rule(pattern, statusCode, code) {
  return { pattern, statusCode, code };
}

/**
 * Message-pattern → HTTP mapping for REC.CANDIDATE_TO_EMPLOYEE_PKG business errors.
 * First matching rule wins.
 */
const BUSINESS_ERROR_RULES = Object.freeze([
  rule(/already been transferred|already transferred|offer already transferred/i, 409, ERROR_CODES.OFFER_ALREADY_TRANSFERRED),
  rule(/offer has already been converted|offer already converted/i, 409, ERROR_CODES.OFFER_ALREADY_CONVERTED),
  rule(/already been converted|already converted/i, 409, ERROR_CODES.CANDIDATE_ALREADY_CONVERTED),
  rule(/email already exists|employee already exists|duplicate.*email/i, 409, ERROR_CODES.EMPLOYEE_ALREADY_EXISTS),
  rule(/must be accepted|not accepted|offer must be accepted/i, 400, ERROR_CODES.OFFER_NOT_ACCEPTED),
  rule(/no accepted offer|accepted offer was not found|accepted offer not found/i, 404, ERROR_CODES.ACCEPTED_OFFER_NOT_FOUND),
  rule(/offer not found|offer does not exist|no offer found/i, 404, ERROR_CODES.OFFER_NOT_FOUND),
  rule(/candidate not found|candidate does not exist|no candidate found/i, 404, ERROR_CODES.CANDIDATE_NOT_FOUND),
  rule(/invalid.*department|inactive department|department.*(invalid|inactive|not found)/i, 400, ERROR_CODES.INVALID_DEPARTMENT),
  rule(/invalid.*position|inactive position|position.*(invalid|inactive|not found)/i, 400, ERROR_CODES.INVALID_POSITION),
  rule(/job family/i, 400, ERROR_CODES.JOB_FAMILY_NOT_CONFIGURED),
  rule(/job level/i, 400, ERROR_CODES.JOB_LEVEL_NOT_CONFIGURED),
  rule(
    /grade (is )?(missing|required|not (configured|found|set|assigned))|missing grade|grade not configured/i,
    400,
    ERROR_CODES.GRADE_NOT_CONFIGURED
  ),
  rule(/reporting manager|invalid manager|manager.*(invalid|inactive|not found)/i, 400, ERROR_CODES.INVALID_REPORTING_MANAGER),
  rule(/assignment/i, 400, ERROR_CODES.ASSIGNMENT_CREATION_FAILED)
]);

/**
 * @param {unknown} err
 * @returns {number|null}
 */
export function extractOracleErrorNum(err) {
  if (!err) return null;
  if (err.errorNum != null && Number.isFinite(Number(err.errorNum))) {
    return Number(err.errorNum);
  }
  const message = String(err.message || '');
  const match = message.match(/ORA-(\d{5})/i);
  return match ? Number(match[1]) : null;
}

function isApplicationErrorNum(errorNum) {
  return (
    Number.isFinite(errorNum) &&
    errorNum >= APPLICATION_ERROR_MIN &&
    errorNum <= APPLICATION_ERROR_MAX
  );
}

/**
 * Strip Oracle prefixes and stack frames (ORA-20001, ORA-06512, Help: URLs).
 *
 * @param {unknown} err
 * @returns {string}
 */
export function cleanOracleBusinessMessage(err) {
  const raw = String(err?.message ?? err ?? '');
  if (!raw) return '';

  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const appLine =
    lines.find((l) => /ORA-20\d{3}:/i.test(l)) ||
    lines.find((l) => /ORA-\d{5}:/i.test(l)) ||
    lines[0] ||
    '';

  return appLine
    .replace(/^Error:\s*/i, '')
    .replace(/^ORA-\d{5}:\s*/i, '')
    .replace(/\s*Help:\s*https?:\/\/\S+/gi, '')
    .split(/\s+ORA-\d{5}:/i)[0]
    .trim();
}

/**
 * @param {string} message
 * @returns {{ statusCode: number, code: string } | null}
 */
export function matchBusinessErrorRule(message) {
  const text = String(message ?? '');
  for (const item of BUSINESS_ERROR_RULES) {
    if (item.pattern.test(text)) {
      return { statusCode: item.statusCode, code: item.code };
    }
  }
  return null;
}

/**
 * Map an Oracle/driver error to an AppError safe for the Flutter client.
 *
 * @param {unknown} err
 * @param {{
 *   genericMessage?: string,
 *   unmatchedAppCode?: string,
 *   unmatchedAppStatusCode?: number,
 *   unexpectedCode?: string
 * }} [options]
 * @returns {AppError}
 */
export function mapConversionOracleError(err, options = {}) {
  if (err instanceof AppError) return err;

  const genericMessage = options.genericMessage || GENERIC_ERROR_MESSAGE;
  const unmatchedAppCode = options.unmatchedAppCode || ERROR_CODES.CANDIDATE_CONVERSION_FAILED;
  const unmatchedAppStatusCode = options.unmatchedAppStatusCode ?? 400;
  const unexpectedCode = options.unexpectedCode || ERROR_CODES.CANDIDATE_CONVERSION_FAILED;

  const errorNum = extractOracleErrorNum(err);
  const cleaned = cleanOracleBusinessMessage(err);

  if (isApplicationErrorNum(errorNum)) {
    const matched = matchBusinessErrorRule(cleaned);
    if (matched) {
      return new AppError(cleaned || genericMessage, matched.statusCode, matched.code);
    }
    return new AppError(cleaned || genericMessage, unmatchedAppStatusCode, unmatchedAppCode);
  }

  return new AppError(genericMessage, 500, unexpectedCode);
}

/**
 * Transfer-to-HR Oracle mapping. Unmatched unexpected errors are TRANSFER_FAILED / 500.
 *
 * @param {unknown} err
 * @returns {AppError}
 */
export function mapTransferOracleError(err) {
  return mapConversionOracleError(err, {
    genericMessage: GENERIC_TRANSFER_ERROR_MESSAGE,
    unmatchedAppCode: ERROR_CODES.TRANSFER_FAILED,
    unmatchedAppStatusCode: 400,
    unexpectedCode: ERROR_CODES.TRANSFER_FAILED
  });
}
