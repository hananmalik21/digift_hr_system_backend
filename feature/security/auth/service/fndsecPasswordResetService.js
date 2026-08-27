import { hashPasswordArgon2id } from '../../users/service/fndsecUsersService.js';
import { sendEmail } from '../../../../services/email.service.js';
import EnterpriseModel from '../../../enterprise_structure/enterprises/model/enterpriseModel.js';
import {
  getFndsecResetAccountViaPackage,
  resetFndsecUserPasswordViaPackage
} from '../repository/fndsecPasswordResetRepository.js';
import {
  FNDSEC_FORGOT_PASSWORD_EMAIL_SEND_FAILED,
  FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR,
  FNDSEC_FORGOT_PASSWORD_RATE_LIMIT_MESSAGE,
  FNDSEC_FORGOT_PASSWORD_SUCCESS_MESSAGE,
  FNDSEC_INVALID_OTP_MESSAGE,
  FNDSEC_INVALID_RESET_TOKEN_MESSAGE,
  FNDSEC_PASSWORD_RESET_PURPOSE,
  FNDSEC_PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC,
  FNDSEC_PASSWORD_RESET_UPDATED_BY,
  FNDSEC_RESET_PASSWORD_GENERIC_ERROR,
  FNDSEC_RESET_PASSWORD_SUCCESS_MESSAGE,
  FNDSEC_VERIFY_RESET_OTP_GENERIC_ERROR,
  FNDSEC_VERIFY_RESET_OTP_SUCCESS_MESSAGE
} from '../utils/fndsecPasswordResetConstants.js';
import { buildFndsecPasswordResetOtpEmailContent } from '../utils/fndsecPasswordResetEmail.js';
import { resolveFndsecPasswordResetPackageResult } from '../utils/fndsecPasswordResetResultMap.js';
import {
  checkForgotPasswordRateLimit,
  consumePasswordResetToken,
  generateSecureOtp,
  generateSecureResetToken,
  invalidatePasswordResetArtifacts,
  peekPasswordResetToken,
  recordForgotPasswordRequest,
  storePasswordResetOtp,
  storePasswordResetToken,
  verifyPasswordResetOtp
} from '../utils/fndsecPasswordResetStore.js';

const LOG_TAG = '[fndsecPasswordReset]';

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
    const row = await EnterpriseModel.findById(enterpriseId);
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
 * @param {{ enterprise_id: number, email: string }} input
 */
export async function forgotFndsecPasswordService(input) {
  const enterpriseId = Number(input.enterprise_id);
  const emailLower = String(input.email).trim().toLowerCase();

  if (!checkForgotPasswordRateLimit(enterpriseId, emailLower).allowed) {
    return fail(429, 'RATE_LIMITED', FNDSEC_FORGOT_PASSWORD_RATE_LIMIT_MESSAGE);
  }

  let pkg;
  try {
    pkg = await getFndsecResetAccountViaPackage(enterpriseId, emailLower);
  } catch (err) {
    logOracleError('GET_RESET_ACCOUNT', err);
    return fail(500, 'ERROR', FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR);
  }

  logResultCode('GET_RESET_ACCOUNT', pkg?.result_code);

  const resolved = resolveFndsecPasswordResetPackageResult(pkg, FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR, {
    requireUserGuid: true
  });
  if (!resolved.ok) {
    return { httpStatus: resolved.httpStatus, payload: resolved.payload };
  }

  // Locked accounts (locked_flag=Y) are allowed when Oracle returns SUCCESS.
  recordForgotPasswordRequest(enterpriseId, emailLower);

  // Store OTP keyed by the request email used on verify; send mail to package email.
  const mailTo = pkg.primary_email || emailLower;
  const otp = generateSecureOtp();
  storePasswordResetOtp({
    enterprise_id: enterpriseId,
    user_guid: pkg.user_guid,
    email: emailLower,
    otp,
    purpose: FNDSEC_PASSWORD_RESET_PURPOSE
  });

  const enterpriseName = await resolveEnterpriseDisplayName(enterpriseId);
  const mailContent = buildFndsecPasswordResetOtpEmailContent({
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
    return fail(500, 'EMAIL_SEND_FAILED', FNDSEC_FORGOT_PASSWORD_EMAIL_SEND_FAILED);
  }

  return ok(FNDSEC_FORGOT_PASSWORD_SUCCESS_MESSAGE);
}

/**
 * @param {{ enterprise_id: number, email: string, otp: string }} input
 */
export async function verifyFndsecResetOtpService(input) {
  const enterpriseId = Number(input.enterprise_id);
  const emailLower = String(input.email).trim().toLowerCase();
  const otp = String(input.otp).trim();

  try {
    const verified = verifyPasswordResetOtp(enterpriseId, emailLower, otp);
    if (!verified.ok) {
      return fail(400, 'INVALID_OTP', FNDSEC_INVALID_OTP_MESSAGE);
    }

    const resetToken = generateSecureResetToken();
    storePasswordResetToken({
      ...verified.record,
      reset_token: resetToken,
      purpose: FNDSEC_PASSWORD_RESET_PURPOSE
    });

    return ok(FNDSEC_VERIFY_RESET_OTP_SUCCESS_MESSAGE, {
      reset_token: resetToken,
      expires_in: FNDSEC_PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC
    });
  } catch (err) {
    console.error(LOG_TAG, 'verify-reset-otp failed:', err?.message ?? '');
    return fail(500, 'ERROR', FNDSEC_VERIFY_RESET_OTP_GENERIC_ERROR);
  }
}

/**
 * @param {{ reset_token: string, new_password: string }} input
 */
export async function resetFndsecPasswordService(input) {
  const resetToken = String(input.reset_token).trim();
  const newPassword = String(input.new_password);

  const peeked = peekPasswordResetToken(resetToken);
  if (!peeked.ok) {
    return fail(400, 'INVALID_RESET_TOKEN', FNDSEC_INVALID_RESET_TOKEN_MESSAGE);
  }

  const { enterprise_id, user_guid, email } = peeked.record;

  let passwordHash;
  try {
    passwordHash = await hashPasswordArgon2id(newPassword);
  } catch (err) {
    console.error(LOG_TAG, 'password hash failed:', err?.message ?? '');
    return fail(500, 'ERROR', FNDSEC_RESET_PASSWORD_GENERIC_ERROR);
  }

  let pkg;
  try {
    pkg = await resetFndsecUserPasswordViaPackage(
      enterprise_id,
      user_guid,
      passwordHash,
      FNDSEC_PASSWORD_RESET_UPDATED_BY
    );
  } catch (err) {
    logOracleError('RESET_PASSWORD', err);
    return fail(500, 'ERROR', FNDSEC_RESET_PASSWORD_GENERIC_ERROR);
  }

  logResultCode('RESET_PASSWORD', pkg?.result_code);

  const resolved = resolveFndsecPasswordResetPackageResult(pkg, FNDSEC_RESET_PASSWORD_GENERIC_ERROR);
  if (!resolved.ok) {
    return { httpStatus: resolved.httpStatus, payload: resolved.payload };
  }

  consumePasswordResetToken(resetToken);
  invalidatePasswordResetArtifacts(enterprise_id, email);

  return ok(FNDSEC_RESET_PASSWORD_SUCCESS_MESSAGE);
}
