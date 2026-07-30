/**
 * Centralized Oracle application-error mapping for
 * PAY.PAY_COMPENSATION_TRANSFER_PKG.
 *
 * ORA-20037 (invalid Payroll Definition) is also registered on DatabaseError.
 */

const BAD_REQUEST = Object.freeze({
  httpStatus: 400,
  errorCode: 'COMP_TRANSFER_BAD_REQUEST',
  message: 'Invalid compensation transfer request.'
});

const UNPROCESSABLE = Object.freeze({
  httpStatus: 422,
  errorCode: 'COMP_TRANSFER_UNPROCESSABLE',
  message: 'Compensation transfer could not be completed with the supplied values.'
});

const CONFLICT = Object.freeze({
  httpStatus: 409,
  errorCode: 'COMP_TRANSFER_CONFLICT',
  message: 'Compensation transfer conflicts with an existing payroll entry.'
});

function mapCodes(codes, entry) {
  return Object.fromEntries(codes.map((code) => [code, entry]));
}

export const COMP_TRANSFER_ORACLE_ERROR_MAP = Object.freeze({
  ...mapCodes([20001, 20002, 20003, 20004, 20010], BAD_REQUEST),
  20021: {
    httpStatus: 404,
    errorCode: 'PAY_RUN_NOT_FOUND',
    message: 'Compensation pay run was not found.'
  },
  20022: {
    httpStatus: 404,
    errorCode: 'PAY_RUN_LINE_NOT_FOUND',
    message: 'Compensation pay-run line was not found.'
  },
  ...mapCodes([20024, 20025, 20026, 20028, 20032, 20033, 20034], UNPROCESSABLE),
  ...mapCodes([20027, 20029, 20030, 20035, 20036, 20040], CONFLICT),
  20031: {
    httpStatus: 409,
    errorCode: 'TRANSFERRED_ENTRY_MISMATCH',
    message:
      'The compensation line was already transferred using different payroll information or values.'
  },
  20037: {
    httpStatus: 422,
    errorCode: 'INVALID_PAYROLL_DEFINITION',
    message:
      'The selected Payroll Definition is inactive, invalid, belongs to another enterprise, or is not effective for the compensation period.'
  }
});

const ORA_20040_VALIDATION_HINTS = ['INVALID', 'INACTIVE', 'NOT EFFECTIVE', 'VALIDATION'];

/**
 * @param {unknown} oracleError
 * @returns {number|null}
 */
export function extractOracleErrorNum(oracleError) {
  if (!oracleError) return null;
  if (oracleError.errorNum != null && Number.isFinite(Number(oracleError.errorNum))) {
    return Number(oracleError.errorNum);
  }
  const message = String(oracleError.message || '');
  const match = message.match(/ORA-(\d{5})/i);
  return match ? Number(match[1]) : null;
}

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function extractOracleCode(oracleError) {
  const errorNum = extractOracleErrorNum(oracleError);
  if (errorNum == null) return null;
  return `ORA-${String(errorNum).padStart(5, '0')}`;
}

/**
 * @param {number} errorNum
 * @param {string} message
 */
export function createSyntheticOracleError(errorNum, message) {
  const oracleCode = `ORA-${String(errorNum).padStart(5, '0')}`;
  const err = new Error(`${oracleCode}: ${message}`);
  err.errorNum = errorNum;
  err.message = `${oracleCode}: ${message}`;
  return err;
}

/**
 * @param {unknown} oracleError
 * @param {Record<string, unknown>} [context]
 */
export function mapCompensationTransferOracleError(oracleError, context = {}) {
  const errorNum = extractOracleErrorNum(oracleError);
  const oracleCode = extractOracleCode(oracleError);
  const mapped = errorNum != null ? COMP_TRANSFER_ORACLE_ERROR_MAP[errorNum] : null;

  if (!mapped) {
    return {
      success: false,
      httpStatus: 500,
      error_code: 'DATABASE_ERROR',
      message: 'A database error occurred while transferring compensation to payroll.',
      details: {
        oracle_code: oracleCode,
        ...context
      }
    };
  }

  let httpStatus = mapped.httpStatus;
  let errorCode = mapped.errorCode;
  const message = mapped.message;

  // ORA-20040: prefer 422 when the package message indicates validation.
  if (errorNum === 20040) {
    const upper = String(oracleError?.message || '').toUpperCase();
    if (ORA_20040_VALIDATION_HINTS.some((hint) => upper.includes(hint))) {
      httpStatus = 422;
      errorCode = 'COMP_TRANSFER_UNPROCESSABLE';
    }
  }

  return {
    success: false,
    httpStatus,
    error_code: errorCode,
    message,
    details: {
      oracle_code: oracleCode,
      ...context
    }
  };
}

/**
 * User-facing message for DatabaseError construction.
 * @param {unknown} oracleError
 */
export function resolveCompensationTransferUserMessage(oracleError) {
  return mapCompensationTransferOracleError(oracleError).message;
}
