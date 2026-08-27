/**
 * Unit tests for FNDSEC main-user password-reset validators, store, result map, and email.
 * No live Oracle / SMTP required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  validateFndsecForgotPasswordBody,
  validateFndsecResetPasswordBody,
  validateFndsecVerifyResetOtpBody
} from '../utils/fndsecPasswordResetValidators.js';
import {
  mapFndsecPasswordResetPackageFailure,
  resolveFndsecPasswordResetPackageResult
} from '../utils/fndsecPasswordResetResultMap.js';
import {
  checkForgotPasswordRateLimit,
  clearFndsecPasswordResetStoreForTests,
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
import {
  FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS,
  FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS
} from '../utils/fndsecPasswordResetConstants.js';
import {
  buildFndsecPasswordResetEmailSubject,
  buildFndsecPasswordResetOtpEmailContent,
  formatEnterpriseBrandName
} from '../utils/fndsecPasswordResetEmail.js';

test.beforeEach(() => {
  clearFndsecPasswordResetStoreForTests();
});

test('formatEnterpriseBrandName uses enterprise name for main HR emails', () => {
  assert.equal(formatEnterpriseBrandName('Digify LLC'), 'Digify LLC');
  assert.equal(formatEnterpriseBrandName(''), 'Digify HR');
});

test('buildFndsecPasswordResetEmailSubject brands with enterprise name', () => {
  assert.equal(
    buildFndsecPasswordResetEmailSubject('Digify LLC'),
    'Digify LLC — Password Reset Verification'
  );
  assert.equal(
    buildFndsecPasswordResetEmailSubject(''),
    'Password Reset Verification Code'
  );
});

test('buildFndsecPasswordResetOtpEmailContent builds professional body', () => {
  const content = buildFndsecPasswordResetOtpEmailContent({
    otp: '482731',
    enterpriseName: 'Digify LLC',
    email: 'user@company.com'
  });
  assert.match(content.text, /Digify LLC/);
  assert.match(content.text, /482731/);
  assert.match(content.html, /Verification code/);
});

test('mapFndsecPasswordResetPackageFailure maps USER_NOT_FOUND to 404', () => {
  const out = mapFndsecPasswordResetPackageFailure(
    'USER_NOT_FOUND',
    'This email does not exist with any user.',
    'fallback'
  );
  assert.equal(out.httpStatus, 404);
  assert.equal(out.payload.code, 'USER_NOT_FOUND');
  assert.equal(out.payload.message, 'This email does not exist with any user.');
});

test('resolveFndsecPasswordResetPackageResult maps ACCOUNT_SUSPENDED and MULTIPLE_USERS', () => {
  const suspended = resolveFndsecPasswordResetPackageResult(
    { result_code: 'ACCOUNT_SUSPENDED', result_message: 'User account is suspended.' },
    'fallback'
  );
  assert.equal(suspended.ok, false);
  assert.equal(suspended.httpStatus, 403);
  assert.equal(suspended.payload.code, 'ACCOUNT_SUSPENDED');

  const multiple = resolveFndsecPasswordResetPackageResult(
    { result_code: 'MULTIPLE_USERS', result_message: '' },
    'fallback'
  );
  assert.equal(multiple.ok, false);
  assert.equal(multiple.httpStatus, 409);
  assert.equal(multiple.payload.code, 'MULTIPLE_USERS');
});

test('resolveFndsecPasswordResetPackageResult requires user_guid on SUCCESS', () => {
  const missing = resolveFndsecPasswordResetPackageResult(
    { result_code: 'SUCCESS', user_guid: null },
    'fallback',
    { requireUserGuid: true }
  );
  assert.equal(missing.ok, false);

  const okResult = resolveFndsecPasswordResetPackageResult(
    {
      result_code: 'SUCCESS',
      user_guid: '501D19D3B5CF219CE0633519000AF268'
    },
    'fallback',
    { requireUserGuid: true }
  );
  assert.equal(okResult.ok, true);
});

test('validateFndsecForgotPasswordBody normalizes email', () => {
  const out = validateFndsecForgotPasswordBody({
    enterprise_id: 1,
    email: '  Employee@Company.COM '
  });
  assert.deepEqual(out, { enterprise_id: 1, email: 'user@company.com' });
});

test('validateFndsecVerifyResetOtpBody requires 6-digit otp', () => {
  assert.throws(
    () =>
      validateFndsecVerifyResetOtpBody({
        enterprise_id: 1,
        email: 'a@b.com',
        otp: '12ab'
      }),
    ValidationError
  );
});

test('validateFndsecResetPasswordBody enforces policy and match', () => {
  assert.throws(
    () =>
      validateFndsecResetPasswordBody({
        reset_token: 'tok',
        new_password: 'NewPassword@123',
        confirm_password: 'Other@123'
      }),
    ValidationError
  );

  const out = validateFndsecResetPasswordBody({
    reset_token: ' tok ',
    new_password: 'NewPassword@123',
    confirm_password: 'NewPassword@123'
  });
  assert.equal(out.reset_token, 'tok');
});

test('OTP store verifies once and rejects reuse', () => {
  storePasswordResetOtp({
    enterprise_id: 1,
    user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'user@company.com',
    otp: '482731'
  });

  assert.equal(verifyPasswordResetOtp(1, 'employee@company.com', '482731').ok, true);
  assert.equal(verifyPasswordResetOtp(1, 'employee@company.com', '482731').ok, false);
});

test('OTP store locks after max failed attempts', () => {
  storePasswordResetOtp({
    enterprise_id: 2,
    user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'user@company.com',
    otp: '111111'
  });

  for (let i = 0; i < FNDSEC_PASSWORD_RESET_OTP_MAX_ATTEMPTS; i += 1) {
    assert.equal(verifyPasswordResetOtp(2, 'user@company.com', '000000').ok, false);
  }
  assert.equal(verifyPasswordResetOtp(2, 'user@company.com', '111111').ok, false);
});

test('reset token peek/consume works', () => {
  const token = generateSecureResetToken();
  storePasswordResetToken({
    enterprise_id: 1,
    user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'a@b.com',
    reset_token: token
  });

  assert.equal(peekPasswordResetToken(token).ok, true);
  assert.equal(consumePasswordResetToken(token).ok, true);
  assert.equal(peekPasswordResetToken(token).ok, false);
});

test('invalidatePasswordResetArtifacts clears OTP and tokens', () => {
  storePasswordResetOtp({
    enterprise_id: 9,
    user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'z@z.com',
    otp: '999999'
  });
  const token = generateSecureResetToken();
  storePasswordResetToken({
    enterprise_id: 9,
    user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'z@z.com',
    reset_token: token
  });

  invalidatePasswordResetArtifacts(9, 'z@z.com');
  assert.equal(verifyPasswordResetOtp(9, 'z@z.com', '999999').ok, false);
  assert.equal(peekPasswordResetToken(token).ok, false);
});

test('forgot-password rate limit blocks after max requests', () => {
  for (let i = 0; i < FNDSEC_PASSWORD_RESET_FORGOT_MAX_REQUESTS; i += 1) {
    assert.equal(checkForgotPasswordRateLimit(1, 'rate@company.com').allowed, true);
    recordForgotPasswordRequest(1, 'rate@company.com');
  }
  assert.equal(checkForgotPasswordRateLimit(1, 'rate@company.com').allowed, false);
});

test('generateSecureOtp returns 6 digits', () => {
  assert.match(generateSecureOtp(), /^\d{6}$/);
});
