export const FNDSEC_PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';
export const FNDSEC_PASSWORD_RESET_USER_TYPE = 'MAIN_USER';
export const FNDSEC_PASSWORD_RESET_UPDATED_BY = 'PASSWORD_RESET';
export const FNDSEC_MIN_PASSWORD_LENGTH = 8;

export const FNDSEC_PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
export const FNDSEC_PASSWORD_RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const FNDSEC_PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC = Math.floor(
  FNDSEC_PASSWORD_RESET_TOKEN_TTL_MS / 1000
);
export const FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;
export const FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS = 3;
export const FNDSEC_PASSWORD_RESET_FORGOT_WINDOW_MS = 15 * 60 * 1000;

export const FNDSEC_FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'Verification code has been sent to your email.';
export const FNDSEC_FORGOT_PASSWORD_GENERIC_ERROR =
  'Unable to process password reset request. Please try again.';
export const FNDSEC_FORGOT_PASSWORD_RATE_LIMIT_MESSAGE =
  'Too many password reset requests. Please try again later.';
export const FNDSEC_FORGOT_PASSWORD_EMAIL_SEND_FAILED =
  'Unable to send verification code. Please try again.';

export const FNDSEC_VERIFY_RESET_OTP_SUCCESS_MESSAGE = 'Verification successful.';
export const FNDSEC_VERIFY_RESET_OTP_GENERIC_ERROR =
  'Unable to verify the code. Please try again.';
export const FNDSEC_INVALID_OTP_MESSAGE =
  'The verification code is invalid or expired.';

export const FNDSEC_RESET_PASSWORD_SUCCESS_MESSAGE = 'Password reset successfully.';
export const FNDSEC_RESET_PASSWORD_GENERIC_ERROR =
  'Unable to reset password. Please try again.';
export const FNDSEC_INVALID_RESET_TOKEN_MESSAGE =
  'The password reset request is invalid or expired.';
