/**
 * Map REC.RESET_CANDIDATE_PASSWORD_PKG result codes to HTTP + API payloads.
 */

const DEFAULT_MESSAGES = {
  CANDIDATE_NOT_FOUND: 'This email does not exist with any candidate.',
  USER_ACCOUNT_NOT_FOUND: 'Candidate exists, but no user account exists for this email.',
  MULTIPLE_CANDIDATES: 'Multiple candidates exist with this email address.',
  MULTIPLE_USER_ACCOUNTS: 'Multiple user accounts exist for this email address.',
  ACCOUNT_INACTIVE: 'Candidate user account is inactive.',
  INVALID_ENTERPRISE: 'Invalid enterprise.',
  INVALID_EMAIL: 'Invalid email address.',
  INVALID_USER: 'Invalid candidate user.',
  INVALID_PASSWORD_HASH: 'Invalid password hash.',
  ACCOUNT_NOT_FOUND: 'Candidate user account was not found.',
  UPDATE_FAILED: 'Unable to update password. Please try again.',
  ERROR: 'Unable to process password reset request. Please try again.'
};

const HTTP_BY_CODE = {
  CANDIDATE_NOT_FOUND: 404,
  USER_ACCOUNT_NOT_FOUND: 404,
  ACCOUNT_NOT_FOUND: 404,
  MULTIPLE_CANDIDATES: 409,
  MULTIPLE_USER_ACCOUNTS: 409,
  ACCOUNT_INACTIVE: 403,
  INVALID_ENTERPRISE: 400,
  INVALID_EMAIL: 400,
  INVALID_USER: 400,
  INVALID_PASSWORD_HASH: 400,
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
 *          null when resultCode is SUCCESS / S (caller continues)
 */
export function mapPasswordResetPackageFailure(resultCode, resultMessage, fallbackMessage) {
  const code = normalizeResultCode(resultCode);

  if (!code || isSuccessResultCode(code)) {
    return null;
  }

  const oracleMessage = String(resultMessage ?? '').trim();
  const defaultMessage = DEFAULT_MESSAGES[code] || fallbackMessage;
  const safeMessage = /ORA-\d+/i.test(oracleMessage) ? defaultMessage : oracleMessage || defaultMessage;

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
 * Resolve package OUT binds for password-reset flows.
 * Optionally require candidate_user_guid after SUCCESS (forgot-password).
 *
 * @param {{ result_code?: string|null, result_message?: string|null, candidate_user_guid?: string|null }} pkg
 * @param {string} fallbackMessage
 * @param {{ requireCandidateUserGuid?: boolean }} [options]
 * @returns {{ ok: true } | { ok: false, httpStatus: number, payload: object }}
 */
export function resolvePasswordResetPackageResult(pkg, fallbackMessage, options = {}) {
  const failure = mapPasswordResetPackageFailure(
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

  if (options.requireCandidateUserGuid && !pkg?.candidate_user_guid) {
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
