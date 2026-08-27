/**
 * Map FNDSEC.RESET_USER_PASSWORD_PKG result codes to HTTP + API payloads.
 * Source of truth: FNDSEC.FNDSEC_USERS only (no EMPL.EMPLOYEES lookup).
 */

const DEFAULT_MESSAGES = {
  USER_NOT_FOUND: 'This email does not exist with any user.',
  MULTIPLE_USERS: 'Multiple user accounts exist with this email address.',
  ACCOUNT_INACTIVE: 'User account is inactive.',
  ACCOUNT_SUSPENDED: 'User account is suspended.',
  INVALID_ENTERPRISE: 'Invalid enterprise.',
  INVALID_EMAIL: 'Invalid email address.',
  INVALID_USER: 'Invalid user.',
  INVALID_PASSWORD_HASH: 'Invalid password hash.',
  INVALID_UPDATED_BY: 'Invalid updated-by value.',
  UPDATE_FAILED: 'Unable to update password. Please try again.',
  ERROR: 'Unable to process password reset request. Please try again.'
};

const HTTP_BY_CODE = {
  USER_NOT_FOUND: 404,
  MULTIPLE_USERS: 409,
  ACCOUNT_INACTIVE: 403,
  ACCOUNT_SUSPENDED: 403,
  INVALID_ENTERPRISE: 400,
  INVALID_EMAIL: 400,
  INVALID_USER: 400,
  INVALID_PASSWORD_HASH: 400,
  INVALID_UPDATED_BY: 400,
  UPDATE_FAILED: 500,
  ERROR: 500
};

function normalizeResultCode(resultCode) {
  return String(resultCode ?? '')
    .trim()
    .toUpperCase();
}

function isSuccessResultCode(resultCode) {
  const code = normalizeResultCode(resultCode);
  return code === 'SUCCESS' || code === 'S';
}

/**
 * @param {string|null|undefined} resultCode
 * @param {string|null|undefined} resultMessage
 * @param {string} fallbackMessage
 * @returns {{ httpStatus: number, payload: { success: false, code: string, message: string } } | null}
 */
export function mapFndsecPasswordResetPackageFailure(
  resultCode,
  resultMessage,
  fallbackMessage
) {
  const code = normalizeResultCode(resultCode);

  if (!code || isSuccessResultCode(code)) {
    return null;
  }

  const oracleMessage = String(resultMessage ?? '').trim();
  const defaultMessage = DEFAULT_MESSAGES[code] || fallbackMessage;
  const safeMessage = /ORA-\d+/i.test(oracleMessage)
    ? defaultMessage
    : oracleMessage || defaultMessage;

  return {
    httpStatus: HTTP_BY_CODE[code] ?? 400,
    payload: {
      success: false,
      code,
      message: safeMessage
    }
  };
}

/**
 * @param {{ result_code?: string|null, result_message?: string|null, user_guid?: string|null }} pkg
 * @param {string} fallbackMessage
 * @param {{ requireUserGuid?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, httpStatus: number, payload: object }}
 */
export function resolveFndsecPasswordResetPackageResult(pkg, fallbackMessage, options = {}) {
  const failure = mapFndsecPasswordResetPackageFailure(
    pkg?.result_code,
    pkg?.result_message,
    fallbackMessage
  );
  if (failure) {
    return { ok: false, ...failure };
  }

  if (!isSuccessResultCode(pkg?.result_code)) {
    return {
      ok: false,
      httpStatus: 400,
      payload: {
        success: false,
        code: normalizeResultCode(pkg?.result_code) || 'ERROR',
        message: String(pkg?.result_message || fallbackMessage)
      }
    };
  }

  if (options.requireUserGuid && !pkg?.user_guid) {
    return {
      ok: false,
      httpStatus: 500,
      payload: {
        success: false,
        code: 'ERROR',
        message: fallbackMessage
      }
    };
  }

  return { ok: true };
}
