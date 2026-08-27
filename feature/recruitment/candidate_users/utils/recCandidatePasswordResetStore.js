import crypto from 'crypto';
import {
  PASSWORD_RESET_FORGOT_MAX_REQUESTS,
  PASSWORD_RESET_FORGOT_WINDOW_MS,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS,
  PASSWORD_RESET_OTP_TTL_MS,
  PASSWORD_RESET_PURPOSE,
  PASSWORD_RESET_TOKEN_TTL_MS,
  PASSWORD_RESET_USER_TYPE
} from './recCandidatePortalConstants.js';

/** @typedef {{ enterprise_id: number, candidate_user_guid: string, email: string, purpose: string, user_type: string, expires_at: number, created_at: number, used_flag: boolean }} ResetTokenRecord */
/** @typedef {ResetTokenRecord & { otp_hash: string, attempt_count: number }} OtpRecord */

/** @type {Map<string, OtpRecord>} */
const otpStore = new Map();
/** @type {Map<string, ResetTokenRecord>} */
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

/**
 * @param {{ used_flag?: boolean, purpose?: string, user_type?: string, expires_at?: number } | null | undefined} rec
 * @param {number} now
 */
function isActivePasswordResetRecord(rec, now) {
  return Boolean(
    rec &&
      !rec.used_flag &&
      rec.purpose === PASSWORD_RESET_PURPOSE &&
      rec.user_type === PASSWORD_RESET_USER_TYPE &&
      Number(rec.expires_at) > now
  );
}

/**
 * @param {{ enterprise_id: number, candidate_user_guid: string, email: string, user_type: string }} rec
 */
function toAccountSnapshot(rec) {
  return {
    enterprise_id: rec.enterprise_id,
    candidate_user_guid: rec.candidate_user_guid,
    email: rec.email,
    user_type: rec.user_type,
    purpose: PASSWORD_RESET_PURPOSE
  };
}

function purgeExpiredOtp(key, now = Date.now()) {
  const rec = otpStore.get(key);
  if (rec && !isActivePasswordResetRecord(rec, now)) {
    otpStore.delete(key);
  }
}

function purgeExpiredResetToken(tokenHash, now = Date.now()) {
  const rec = resetTokenStore.get(tokenHash);
  if (rec && !isActivePasswordResetRecord(rec, now)) {
    resetTokenStore.delete(tokenHash);
  }
}

/**
 * @param {string} resetToken
 * @param {{ consume?: boolean }} [options]
 * @returns {{ ok: true, record: ReturnType<typeof toAccountSnapshot> } | { ok: false }}
 */
function readPasswordResetToken(resetToken, options = {}) {
  const tokenHash = hashSecret(resetToken);
  const now = Date.now();
  purgeExpiredResetToken(tokenHash, now);

  const rec = resetTokenStore.get(tokenHash);
  if (!isActivePasswordResetRecord(rec, now)) {
    return { ok: false };
  }

  if (options.consume) {
    rec.used_flag = true;
    resetTokenStore.delete(tokenHash);
  }

  return { ok: true, record: toAccountSnapshot(rec) };
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

/**
 * Cryptographically secure 6-digit numeric OTP (100000–999999).
 * @returns {string}
 */
export function generateSecureOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

/**
 * Cryptographically secure reset token (opaque hex).
 * @returns {string}
 */
export function generateSecureResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function checkForgotPasswordRateLimit(enterpriseId, emailLower) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  const entry = forgotRateStore.get(key);

  if (!entry || now - entry.windowStartedAt >= PASSWORD_RESET_FORGOT_WINDOW_MS) {
    return { allowed: true, remaining: PASSWORD_RESET_FORGOT_MAX_REQUESTS };
  }

  if (entry.count >= PASSWORD_RESET_FORGOT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  return {
    allowed: true,
    remaining: PASSWORD_RESET_FORGOT_MAX_REQUESTS - entry.count
  };
}

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 */
export function recordForgotPasswordRequest(enterpriseId, emailLower) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  const entry = forgotRateStore.get(key);

  if (!entry || now - entry.windowStartedAt >= PASSWORD_RESET_FORGOT_WINDOW_MS) {
    forgotRateStore.set(key, { count: 1, windowStartedAt: now });
    return;
  }

  entry.count += 1;
}

/**
 * Stores a hashed OTP; invalidates any prior active OTP for the same account.
 * @param {{
 *   enterprise_id: number,
 *   candidate_user_guid: string,
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
    candidate_user_guid: String(input.candidate_user_guid).toUpperCase(),
    email,
    otp_hash: hashSecret(input.otp),
    purpose: input.purpose || PASSWORD_RESET_PURPOSE,
    user_type: PASSWORD_RESET_USER_TYPE,
    expires_at: now + PASSWORD_RESET_OTP_TTL_MS,
    attempt_count: 0,
    created_at: now,
    used_flag: false
  });
}

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 * @param {string} otp
 * @returns {{ ok: true, record: ReturnType<typeof toAccountSnapshot> } | { ok: false }}
 */
export function verifyPasswordResetOtp(enterpriseId, emailLower, otp) {
  const key = accountKey(enterpriseId, emailLower);
  const now = Date.now();
  purgeExpiredOtp(key, now);

  const rec = otpStore.get(key);
  if (!isActivePasswordResetRecord(rec, now)) {
    return { ok: false };
  }

  if (rec.attempt_count >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { ok: false };
  }

  if (!timingSafeEqualHex(rec.otp_hash, hashSecret(otp))) {
    rec.attempt_count += 1;
    if (rec.attempt_count >= PASSWORD_RESET_OTP_MAX_ATTEMPTS) {
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
 *   candidate_user_guid: string,
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
    candidate_user_guid: String(input.candidate_user_guid).toUpperCase(),
    email,
    purpose: input.purpose || PASSWORD_RESET_PURPOSE,
    user_type: PASSWORD_RESET_USER_TYPE,
    expires_at: now + PASSWORD_RESET_TOKEN_TTL_MS,
    created_at: now,
    used_flag: false
  });
}

/**
 * @param {string} resetToken
 * @returns {{ ok: true, record: ReturnType<typeof toAccountSnapshot> } | { ok: false }}
 */
export function consumePasswordResetToken(resetToken) {
  return readPasswordResetToken(resetToken, { consume: true });
}

/**
 * Peek without consuming — validate before hashing/Oracle, then consume after SUCCESS.
 * @param {string} resetToken
 * @returns {{ ok: true, record: ReturnType<typeof toAccountSnapshot> } | { ok: false }}
 */
export function peekPasswordResetToken(resetToken) {
  return readPasswordResetToken(resetToken, { consume: false });
}

/**
 * Invalidate remaining OTP + reset tokens for an account after successful reset.
 * @param {number} enterpriseId
 * @param {string} emailLower
 */
export function invalidatePasswordResetArtifacts(enterpriseId, emailLower) {
  otpStore.delete(accountKey(enterpriseId, emailLower));
  deleteResetTokensForAccount(enterpriseId, emailLower);
}

/** Test helper — clears all in-memory password-reset state. */
export function clearPasswordResetStoreForTests() {
  otpStore.clear();
  resetTokenStore.clear();
  forgotRateStore.clear();
}
