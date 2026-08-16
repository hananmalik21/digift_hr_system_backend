/**
 * Map PAY.PAYROLL_TEST_RESET_PKG Oracle errors to the admin test-reset API envelope.
 * Does not expose stack traces, SQL, bind values, or connection details.
 */

import { AppError } from '../../../../utils/errors/index.js';
import {
  ERROR_CODE,
  FAILED_MESSAGE,
  RESET_BUSINESS_ORACLE_CODE_SET
} from '../constants.js';

export class PayrollTestResetError extends AppError {
  /**
   * @param {{ httpStatus?: number, oracleCode?: number|null, oracleMessage?: string|null }} [opts]
   */
  constructor({ httpStatus = 500, oracleCode = null, oracleMessage = null } = {}) {
    super(FAILED_MESSAGE, httpStatus, ERROR_CODE, oracleMessage || FAILED_MESSAGE);
    this.oracleCode = oracleCode;
    this.oracleMessage = oracleMessage || FAILED_MESSAGE;
  }
}

/**
 * @param {unknown} err
 * @returns {number|null} Absolute Oracle error number (e.g. 20991)
 */
export function extractOracleErrorNum(err) {
  if (!err || typeof err !== 'object') return null;

  const direct = err.errorNum ?? err.oracleError?.errorNum;
  if (direct != null && Number.isFinite(Number(direct))) {
    return Math.abs(Number(direct));
  }

  const message = String(err.oracleError?.message || err.message || err.technicalMessage || '');
  const match = message.match(/ORA-(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * Client-safe Oracle application message (first ORA-20xxx line, no ORA-06512 stack).
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizeOracleMessage(err) {
  const raw = String(err?.oracleError?.message || err?.message || err?.technicalMessage || '');
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const appLine =
    lines.find((line) => /ORA-20\d{3}\b/i.test(line) && !/ORA-06512/i.test(line)) ||
    lines.find((line) => /^ORA-\d+:/i.test(line) && !/ORA-06512/i.test(line)) ||
    lines[0] ||
    '';
  const cleaned = appLine.replace(/^ORA-\d+:\s*/i, '').trim();
  return cleaned || FAILED_MESSAGE;
}

export function isResetBusinessOracleError(errorNum) {
  if (errorNum == null || !Number.isFinite(Number(errorNum))) return false;
  return RESET_BUSINESS_ORACLE_CODE_SET.has(Math.abs(Number(errorNum)));
}

/**
 * @param {unknown} err
 * @returns {PayrollTestResetError}
 */
export function mapResetOracleError(err) {
  if (err instanceof PayrollTestResetError) return err;

  const errorNum = extractOracleErrorNum(err);
  const oracleMessage = sanitizeOracleMessage(err);
  const httpStatus = isResetBusinessOracleError(errorNum) ? 409 : 500;
  const oracleCode = errorNum == null ? null : -Math.abs(errorNum);

  return new PayrollTestResetError({
    httpStatus,
    oracleCode,
    oracleMessage
  });
}

export function resetErrorEnvelope(err) {
  const mapped = err instanceof PayrollTestResetError ? err : mapResetOracleError(err);
  return {
    success: false,
    message: FAILED_MESSAGE,
    error: {
      code: ERROR_CODE,
      oracle_code: mapped.oracleCode,
      oracle_message: mapped.oracleMessage
    }
  };
}
