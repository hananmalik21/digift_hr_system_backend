export const PORTAL_DEFAULT_CREATED_BY = 'CAREER_PORTAL';
export const PORTAL_DEFAULT_SOURCE = 'CAREER_PORTAL';
export const PORTAL_DEFAULT_SALARY_CURRENCY = 'USD';
export const PORTAL_MIN_PASSWORD_LENGTH = 8;

export const REGISTER_GENERIC_ERROR = 'Unable to register candidate. Please try again.';
export const REGISTER_SUCCESS_MESSAGE = 'Candidate user registered successfully.';

export const LOGIN_GENERIC_ERROR = 'Unable to login. Please try again.';
export const LOGIN_SUCCESS_MESSAGE = 'Login successful.';
export const LOGIN_INVALID_CREDENTIALS = 'Invalid email or password.';
export const LOGIN_INACTIVE_USER = 'Candidate user is not active.';

/** Password reset / forgot-password (career portal) */
export const PASSWORD_RESET_PURPOSE = 'PASSWORD_RESET';
export const PASSWORD_RESET_USER_TYPE = 'CANDIDATE';
export const PASSWORD_RESET_OTP_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 10 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_EXPIRES_IN_SEC = Math.floor(
  PASSWORD_RESET_TOKEN_TTL_MS / 1000
);
export const PASSWORD_RESET_OTP_MAX_ATTEMPTS = 5;
/** Max forgot-password OTP sends per email+enterprise within the window. */
export const PASSWORD_RESET_FORGOT_MAX_REQUESTS = 3;
export const PASSWORD_RESET_FORGOT_WINDOW_MS = 15 * 60 * 1000;

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'Verification code has been sent to your email.';
export const FORGOT_PASSWORD_GENERIC_ERROR =
  'Unable to process password reset request. Please try again.';
export const FORGOT_PASSWORD_RATE_LIMIT_MESSAGE =
  'Too many password reset requests. Please try again later.';
export const FORGOT_PASSWORD_EMAIL_SEND_FAILED =
  'Unable to send verification code. Please try again.';

export const VERIFY_RESET_OTP_SUCCESS_MESSAGE = 'Verification successful.';
export const VERIFY_RESET_OTP_GENERIC_ERROR =
  'Unable to verify the code. Please try again.';
export const INVALID_OTP_MESSAGE = 'The verification code is invalid or expired.';

export const RESET_PASSWORD_SUCCESS_MESSAGE = 'Password reset successfully.';
export const RESET_PASSWORD_GENERIC_ERROR =
  'Unable to reset password. Please try again.';
export const INVALID_RESET_TOKEN_MESSAGE =
  'The password reset request is invalid or expired.';
