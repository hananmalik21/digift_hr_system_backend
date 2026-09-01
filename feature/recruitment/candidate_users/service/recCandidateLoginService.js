import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { normalizeEmailLower } from '../../shared/recValidationUtils.js';
import { verifyUserPassword } from '@digifyhr/common';
import {
  fetchCandidatePasswordHash,
  loginCandidateViaPackage
} from '../model/recCandidateLoginModel.js';
import {
  LOGIN_GENERIC_ERROR,
  LOGIN_INACTIVE_USER,
  LOGIN_INVALID_CREDENTIALS,
  LOGIN_SUCCESS_MESSAGE
} from '../utils/recCandidatePortalConstants.js';

/**
 * @param {string} message
 * @param {string|null|undefined} status
 */
function resolveLoginFailure(message, status) {
  const msg = String(message ?? '').trim();
  if (/not active/i.test(msg) || /inactive/i.test(msg)) {
    return { httpStatus: 401, message: LOGIN_INACTIVE_USER };
  }
  if (!packageStatusIsSuccess(status)) {
    if (/invalid/i.test(msg) && /password|email|credential/i.test(msg)) {
      return { httpStatus: 401, message: LOGIN_INVALID_CREDENTIALS };
    }
    if (msg) return { httpStatus: 401, message: msg };
  }
  return { httpStatus: 401, message: LOGIN_INVALID_CREDENTIALS };
}

/**
 * @param {Record<string, unknown>} body
 */
export async function loginCandidateUserService(body) {
  const enterpriseId = Number(body.enterprise_id);
  const emailLower = normalizeEmailLower(body.email);
  const plainPassword = String(body.password ?? '');

  const storedHash = await fetchCandidatePasswordHash(enterpriseId, emailLower);
  if (!storedHash || !(await verifyUserPassword(plainPassword, storedHash))) {
    return { httpStatus: 401, payload: { success: false, message: LOGIN_INVALID_CREDENTIALS } };
  }

  let pkg;
  try {
    pkg = await loginCandidateViaPackage(enterpriseId, emailLower, storedHash);
  } catch (err) {
    console.error('[recCandidateLoginService] LOGIN_CANDIDATE failed:', err?.errorNum ?? '', err?.message ?? '');
    return { httpStatus: 500, payload: { success: false, message: LOGIN_GENERIC_ERROR } };
  }

  if (!packageStatusIsSuccess(pkg.status)) {
    const failure = resolveLoginFailure(pkg.message, pkg.status);
    const message = /ORA-\d+/i.test(failure.message) ? LOGIN_GENERIC_ERROR : failure.message;
    return { httpStatus: failure.httpStatus, payload: { success: false, message } };
  }

  return {
    httpStatus: 200,
    payload: {
      success: true,
      message: pkg.message || LOGIN_SUCCESS_MESSAGE,
      data: {
        candidate_user_id: pkg.candidate_user_id ?? null,
        candidate_user_guid: pkg.candidate_user_guid ?? null,
        candidate_id: pkg.candidate_id ?? null,
        candidate_guid: pkg.candidate_guid ?? null,
        full_name: pkg.full_name ?? null,
        email: pkg.email ?? emailLower,
        user_status: pkg.user_status ?? null
      }
    }
  };
}
