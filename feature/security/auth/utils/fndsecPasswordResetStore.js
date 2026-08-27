import crypto from 'crypto';
import {
  FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS,
  FNDSEC_PASSWORD_RESET_FORGOT_WINDOW_MS,
  FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  FNDSEC_PASSWORD_RESET_OTP_TTL_MS,
  FNDSEC_PASSWORD_RESET_PURPOSE,
  FNDSEC_PASSWORD_RESET_TOKEN_TTL_MS,
  FNDSEC_PASSWORD_RESET_USER_TYPE
} from './fndsecPasswordResetConstants.js';

/** @type {Map<string, object>} */
const otpStore = new Map();
/** @type {Map<string, object>} */
const resetTokenStore = new Map();
/** @type {Map<string, { count: number, windowStartedAt: number }>} */
const forgotRateStore = new Map();

function accountKey(enterpriseId, emailLower) {
  return `${Number(enterpriseId)}:${String(emailLower).trim().toLowerCase()}`;
}

function hashSecret(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(String(a), 'utf8');
    const bufB = Buffer.from(String(b), 'utf8');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function isActiveRecord(rec, now) {
  return Boolean(
    rec &&
      !rec.used_flag &&
      rec.purpose === FNDSEC_PASSWORD_RESET_PURPOSE &&
      rec.user_type === FNDSEC_PASSWORD_RESET_USER_TYPE &&
      Number(rec.expires_at) > now
  );
}

function toAccountSnapshot(rec) {
  return {
    enterprise_id: rec.enterprise_id,
    user_guid: rec.user_guid,
    email: rec.email,
    user_type: rec.user_type,
    purpose: FNDSEC_PASSWORD_RESET_PURPOSE
  };
}

function purgeExpiredOtp(key, now = Date.now()) {
  const rec = otpStore.get(key);
  if (rec && !isActiveRecord(rec, now)) otpStore.delete(key);
}

function purgeExpiredResetToken(tokenHash, now = Date.now()) {
  const rec = resetTokenStore.get(tokenHash);
  if (rec && !isActiveRecord(rec, now)) resetTokenStore.delete(tokenHash);
}

function deleteResetTokensForAccount(enterpriseId, emailLower) {
  const email = String(emailLower).trim().toLowerCase();
  const eid = Number(enterpriseId);
  for (const [hash, rec] of resetTokenStore.entries()) {
    if (rec.enterprise_id === eid && rec.email === email) {
      resetTokenStore.delete(hash);
    }
  }
}

function readPasswordResetToken(resetToken, { consume = false } = {}) {
  const tokenHash = hashSecret(resetToken);
  const now = Date.now();
  purgeExpiredResetToken(tokenHash, now);

  const rec = resetTokenStore.get(tokenHash);
  if (!isActiveRecord(rec, now)) return { ok: false };

  if (consume) {
    rec.used_flag = true;
    resetTokenStore.delete(tokenHash);
  }

  return { ok: true, record: toAccountSnapshot(rec) };
}

export function generateSecureOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function generateSecureResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function checkForgotPasswordRateLimit(enterpriseId, emailLower) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  const entry = forgotRateStore.get(key);

  if (!entry || now - entry.windowStartedAt >= FNDSEC_PASSWORD_RESET_FORGOT_WINDOW_MS) {
    return { allowed: true, remaining: FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS };
  }

  if (entry.count >= FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return {
    allowed: true,
    remaining: FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS - entry.count
  };
}

export function recordForgotPasswordRequest(enterpriseId, emailLower) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  const entry = forgotRateStore.get(key);

  if (!entry || now - entry.windowStartedAt >= FNDSEC_PASSWORD_RESET_FORGOT_WINDOW_MS) {
    forgotRateStore.set(key, { count: 1, windowStartedAt: now });
    return;
  }

  entry.count += 1;
}

/**
 * @param {{
 *   enterprise_id: number,
 *   user_guid: string,
 *   email: string,
 *   otp: string,
 *   purpose?: string
 * }} input
 */
export function storePasswordResetOtp(input) {
  const email = String(input.email).trim().toLowerCase();
  const key = accountKey(input.enterprise_id, email);
  const now = Date.now();

  otpStore.set(key, {
    enterprise_id: Number(input.enterprise_id),
    user_guid: String(input.user_guid).toUpperCase(),
    email,
    otp_hash: hashSecret(input.otp),
    purpose: input.purpose || FNDSEC_PASSWORD_RESET_PURPOSE,
    user_type: FNDSEC_PASSWORD_RESET_USER_TYPE,
    expires_at: now + FNDSEC_PASSWORD_RESET_OTP_TTL_MS,
    attempt_count: 0,
    created_at: now,
    used_flag: false
  });
}

export function verifyPasswordResetOtp(enterpriseId, emailLower, otp) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  purgeExpiredOtp(key, now);

  const rec = otpStore.get(key);
  if (!isActiveRecord(rec, now)) return { ok: false };

  if (rec.attempt_count >= FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false };
  }

  if (!timingSafeEqualHex(rec.otp_hash, hashSecret(otp))) {
    rec.attempt_count += 1;
    if (rec.attempt_count >= FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
      otpStore.delete(key);
    }
    return { ok: false };
  }

  otpStore.delete(key);
  return { ok: true, record: toAccountSnapshot(rec) };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   user_guid: string,
 *   email: string,
 *   reset_token: string,
 *   purpose?: string
 * }} input
 */
export function storePasswordResetToken(input) {
  const email = String(input.email).trim().toLowerCase();
  const enterpriseId = Number(input.enterprise_id);
  const now = Date.now();

  deleteResetTokensForAccount(enterpriseId, email);

  resetTokenStore.set(hashSecret(input.reset_token), {
    enterprise_id: enterpriseId,
    user_guid: String(input.user_guid).toUpperCase(),
    email,
    purpose: input.purpose || FNDSEC_PASSWORD_RESET_PURPOSE,
    user_type: FNDSEC_PASSWORD_RESET_USER_TYPE,
    expires_at: now + FNDSEC_PASSWORD_RESET_TOKEN_TTL_MS,
    created_at: now,
    used_flag: false
  });
}

export function peekPasswordResetToken(resetToken) {
  return readPasswordResetToken(resetToken, { consume: false });
}

export function consumePasswordResetToken(resetToken) {
  return readPasswordResetToken(resetToken, { consume: true });
}

export function invalidatePasswordResetArtifacts(enterpriseId, emailLower) {
  otpStore.delete(accountKey(enterpriseId, emailLower));
  deleteResetTokensForAccount(enterpriseId, emailLower);
}

export function clearFndsecPasswordResetStoreForTests() {
  otpStore.clear();
  resetTokenStore.clear();
  forgotRateStore.clear();
}
