import {
  asObject,
  isBlank,
  normalizeEmailLower,
  requirePositiveEnterpriseId,
  throwIfValidationErrors
} from '../../shared/recValidationUtils.js';
import { PORTAL_MIN_PASSWORD_LENGTH } from './recCandidatePortalConstants.js';

const BASIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * @param {string[]} errors
 * @param {Record<string, unknown>} body
 */
function validateEmailFormatInErrors(errors, body) {
  if (isBlank(body.email)) {
    errors.push('email is required');
    return;
  }
  const email = normalizeEmailLower(body.email);
  if (!BASIC_EMAIL_RE.test(email)) {
    errors.push('email must be a valid email address');
  }
}

/**
 * @param {string[]} errors
 * @param {unknown} otp
 */
function validateOtpInErrors(errors, otp) {
  if (isBlank(otp)) {
    errors.push('otp is required');
    return;
  }
  const s = String(otp).trim();
  if (!/^\d{6}$/.test(s)) {
    errors.push('otp must be exactly 6 numeric digits');
  }
}

/**
 * Password policy for reset (and stronger than register min-length alone).
 * @param {string[]} errors
 * @param {unknown} password
 * @param {string} [fieldLabel]
 */
export function validatePasswordPolicyInErrors(errors, password, fieldLabel = 'new_password') {
  if (isBlank(password)) {
    errors.push(`${fieldLabel} is required`);
    return;
  }
  const s = String(password);
  if (s.length < PORTAL_MIN_PASSWORD_LENGTH) {
    errors.push(`${fieldLabel} must be at least ${PORTAL_MIN_PASSWORD_LENGTH} characters`);
  }
  if (!/[A-Z]/.test(s)) {
    errors.push(`${fieldLabel} must contain at least one uppercase letter`);
  }
  if (!/[a-z]/.test(s)) {
    errors.push(`${fieldLabel} must contain at least one lowercase letter`);
  }
  if (!/[0-9]/.test(s)) {
    errors.push(`${fieldLabel} must contain at least one number`);
  }
  if (!/[^A-Za-z0-9]/.test(s)) {
    errors.push(`${fieldLabel} must contain at least one special character`);
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ enterprise_id: number, email: string }}
 */
export function validateForgotPasswordBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateEmailFormatInErrors(errors, b);

  throwIfValidationErrors(errors);

  return {
    enterprise_id: Number(b.enterprise_id),
    email: normalizeEmailLower(b.email)
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ enterprise_id: number, email: string, otp: string }}
 */
export function validateVerifyResetOtpBody(body) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateEmailFormatInErrors(errors, b);
  validateOtpInErrors(errors, b.otp);

  throwIfValidationErrors(errors);

  return {
    enterprise_id: Number(b.enterprise_id),
    email: normalizeEmailLower(b.email),
    otp: String(b.otp).trim()
  };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ reset_token: string, new_password: string, confirm_password: string }}
 */
export function validateResetPasswordBody(body) {
  const b = asObject(body);
  const errors = [];

  if (isBlank(b.reset_token)) {
    errors.push('reset_token is required');
  }

  validatePasswordPolicyInErrors(errors, b.new_password, 'new_password');

  if (isBlank(b.confirm_password)) {
    errors.push('confirm_password is required');
  } else if (
    !isBlank(b.new_password) &&
    String(b.new_password) !== String(b.confirm_password)
  ) {
    errors.push('New password and confirm password do not match.');
  }

  throwIfValidationErrors(errors);

  return {
    reset_token: String(b.reset_token).trim(),
    new_password: String(b.new_password),
    confirm_password: String(b.confirm_password)
  };
}
