import { hashPasswordArgon2id } from '../../../security/security.facade.js';
import { sendEmail } from '../../../../services/email.service.js';
import { getEnterpriseById } from 'digify-hr-enterprise-backend';
import {
  getResetAccountViaPackage,
  resetCandidatePasswordViaPackage
} from '../model/recCandidatePasswordResetModel.js';
import {
  FORGOT_PASSWORD_EMAIL_SEND_FAILED,
  FORGOT_PASSWORD_GENERIC_ERROR,
  FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  INVALID_OTP_MESSAGE,
  INVALID_RESET_TOKEN_MESSAGE,
  PASSWORD_RESET_PURPOSE,
  PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC,
  PORTAL_DEFAULT_CREATED_BY,
  RESET_PASSWORD_GENERIC_ERROR,
  RESET_PASSWORD_SUCCESS_MESSAGE,
  VERIFY_RESET_OTP_GENERIC_ERROR,
  VERIFY_RESET_OTP_SUCCESS_MESSAGE
} from '../utils/recCandidatePortalConstants.js';
import { buildPasswordResetOtpEmailContent } from '../utils/recCandidatePasswordResetEmail.js';
import { resolvePasswordResetPackageResult } from '../utils/recCandidatePasswordResetResultMap.js';
import {
  checkForgotPasswordRateLimit,
  generateSecureOtp,
  generateSecureResetToken,
  invalidatePasswordResetArtifacts,
  peekPasswordResetToken,
  recordForgotPasswordRequest,
  storePasswordResetOtp,
  storePasswordResetToken,
  consumePasswordResetToken,
  verifyPasswordResetOtp
} from '../utils/recCandidatePasswordResetStore.js';

const LOG_TAG = '[recCandidatePasswordReset]';

function ok(message, data) {
  const payload = { success: true, message };
  if (data !== undefined) payload.data = data;
  return { httpStatus: 200, payload };
}

function fail(httpStatus, code, message) {
  return {
    httpStatus,
    payload: { success: false, code, message }
  };
}

function logOracleError(action, err) {
  console.error(LOG_TAG, action, 'failed:', err?.errorNum ?? '', err?.message ?? '');
}

function logResultCode(action, resultCode) {
  console.info(LOG_TAG, action, 'result_code=', resultCode ?? '');
}

/**
 * @param {number} enterpriseId
 * @returns {Promise<string|null>}
 */
async function resolveEnterpriseDisplayName(enterpriseId) {
  try {
    const row = await getEnterpriseById(enterpriseId);
    if (!row) return null;
    const name = row.enterprise_name ?? row.ENTERPRISE_NAME ?? null;
    const trimmed = name != null ? String(name).trim() : '';
    return trimmed || null;
  } catch (err) {
    console.error(LOG_TAG, 'enterprise lookup failed:', err?.message ?? '');
    return null;
  }
}

/**
 * POST forgot-password — returns Oracle business results; OTP only on SUCCESS.
 * @param {{ enterprise_id: number, email: string }} input
 */
export async function forgotCandidatePasswordService(input) {
  const enterpriseId = Number(input.enterprise_id);
  const emailLower = String(input.email).trim().toLowerCase();

  if (!checkForgotPasswordRateLimit(enterpriseId, emailLower).allowed) {
    return fail(429, 'RATE_LIMITED', FORGOT_PASSWORD_RATE_LIMIT_MESSAGE);
  }

  let pkg;
  try {
    pkg = await getResetAccountViaPackage(enterpriseId, emailLower);
  } catch (err) {
    logOracleError('GET_RESET_ACCOUNT', err);
    return fail(500, 'ERROR', FORGOT_PASSWORD_GENERIC_ERROR);
  }

  logResultCode('GET_RESET_ACCOUNT', pkg?.result_code);

  const resolved = resolvePasswordResetPackageResult(pkg, FORGOT_PASSWORD_GENERIC_ERROR, {
    requireCandidateUserGuid: true
  });
  if (!resolved.ok) {
    return { httpStatus: resolved.httpStatus, payload: resolved.payload };
  }

  // Count only OTP-eligible sends toward the rate limit.
  recordForgotPasswordRequest(enterpriseId, emailLower);

  // Store OTP keyed by the request email used on verify; send mail to package email.
  const mailTo = pkg.email || emailLower;
  const otp = generateSecureOtp();
  storePasswordResetOtp({
    enterprise_id: enterpriseId,
    candidate_user_guid: pkg.candidate_user_guid,
    email: emailLower,
    otp,
    purpose: PASSWORD_RESET_PURPOSE
  });

  const enterpriseName = await resolveEnterpriseDisplayName(enterpriseId);
  const mailContent = buildPasswordResetOtpEmailContent({
    otp,
    enterpriseName,
    email: mailTo
  });

  const mailResult = await sendEmail({
    to: mailTo,
    subject: mailContent.subject,
    text: mailContent.text,
    html: mailContent.html
  });

  if (!mailResult.success) {
    invalidatePasswordResetArtifacts(enterpriseId, emailLower);
    console.error(LOG_TAG, 'OTP email send failed (details redacted)');
    return fail(500, 'EMAIL_SEND_FAILED', FORGOT_PASSWORD_EMAIL_SEND_FAILED);
  }

  return ok(FORGOT_PASSWORD_SUCCESS_MESSAGE);
}

/**
 * @param {{ enterprise_id: number, email: string, otp: string }} input
 */
export async function verifyCandidateResetOtpService(input) {
  const enterpriseId = Number(input.enterprise_id);
  const emailLower = String(input.email).trim().toLowerCase();
  const otp = String(input.otp).trim();

  try {
    const verified = verifyPasswordResetOtp(enterpriseId, emailLower, otp);
    if (!verified.ok) {
      return fail(400, 'INVALID_OTP', INVALID_OTP_MESSAGE);
    }

    const resetToken = generateSecureResetToken();
    storePasswordResetToken({
      ...verified.record,
      reset_token: resetToken,
      purpose: PASSWORD_RESET_PURPOSE
    });

    return ok(VERIFY_RESET_OTP_SUCCESS_MESSAGE, {
      reset_token: resetToken,
      expires_in: PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC
    });
  } catch (err) {
    console.error(LOG_TAG, 'verify-reset-otp failed:', err?.message ?? '');
    return fail(500, 'ERROR', VERIFY_RESET_OTP_GENERIC_ERROR);
  }
}

/**
 * @param {{ reset_token: string, new_password: string }} input
 */
export async function resetCandidatePasswordService(input) {
  const resetToken = String(input.reset_token).trim();
  const newPassword = String(input.new_password);

  const peeked = peekPasswordResetToken(resetToken);
  if (!peeked.ok) {
    return fail(400, 'INVALID_RESET_TOKEN', INVALID_RESET_TOKEN_MESSAGE);
  }

  const { enterprise_id, candidate_user_guid, email } = peeked.record;

  let passwordHash;
  try {
    passwordHash = await hashPasswordArgon2id(newPassword);
  } catch (err) {
    console.error(LOG_TAG, 'password hash failed:', err?.message ?? '');
    return fail(500, 'ERROR', RESET_PASSWORD_GENERIC_ERROR);
  }

  let pkg;
  try {
    pkg = await resetCandidatePasswordViaPackage(
      enterprise_id,
      candidate_user_guid,
      passwordHash,
      PORTAL_DEFAULT_CREATED_BY
    );
  } catch (err) {
    logOracleError('RESET_PASSWORD', err);
    return fail(500, 'ERROR', RESET_PASSWORD_GENERIC_ERROR);
  }

  logResultCode('RESET_PASSWORD', pkg?.result_code);

  const resolved = resolvePasswordResetPackageResult(pkg, RESET_PASSWORD_GENERIC_ERROR);
  if (!resolved.ok) {
    return { httpStatus: resolved.httpStatus, payload: resolved.payload };
  }

  consumePasswordResetToken(resetToken);
  invalidatePasswordResetArtifacts(enterprise_id, email);

  return ok(RESET_PASSWORD_SUCCESS_MESSAGE);
}
