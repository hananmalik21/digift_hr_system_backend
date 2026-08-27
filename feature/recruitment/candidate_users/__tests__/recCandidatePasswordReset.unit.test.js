/**
 * Unit tests for candidate password-reset validators, store, and Oracle result mapping.
 * No live Oracle / SMTP required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import {
  validateForgotPasswordBody,
  validateResetPasswordBody,
  validateVerifyResetOtpBody
} from '../utils/recCandidatePasswordResetValidators.js';
import { mapPasswordResetPackageFailure, resolvePasswordResetPackageResult } from '../utils/recCandidatePasswordResetResultMap.js';
import {
  checkForgotPasswordRateLimit,
  clearPasswordResetStoreForTests,
  consumePasswordResetToken,
  generateSecureOtp,
  generateSecureResetToken,
  invalidatePasswordResetArtifacts,
  peekPasswordResetToken,
  recordForgotPasswordRequest,
  storePasswordResetOtp,
  storePasswordResetToken,
  verifyPasswordResetOtp
} from '../utils/recCandidatePasswordResetStore.js';
import {
  PASSWORD_RESET_FORGOT_MAX_REQUESTS,
  PASSWORD_RESET_OTP_MAX_ATTEMPTS
} from '../utils/recCandidatePortalConstants.js';
import {
  buildPasswordResetEmailSubject,
  buildPasswordResetOtpEmailContent,
  formatCareersBrandName
} from '../utils/recCandidatePasswordResetEmail.js';

test.beforeEach(() => {
  clearPasswordResetStoreForTests();
});

test('formatCareersBrandName appends Careers to enterprise name', () => {
  assert.equal(formatCareersBrandName('Digify LLC'), 'Digify LLC Careers');
  assert.equal(formatCareersBrandName('Digify LLC Careers'), 'Digify LLC Careers');
  assert.equal(formatCareersBrandName(''), 'Careers');
});

test('buildPasswordResetEmailSubject includes enterprise careers branding', () => {
  assert.equal(
    buildPasswordResetEmailSubject('Digify LLC'),
    'Digify LLC Careers — Password Reset Verification'
  );
});

test('buildPasswordResetOtpEmailContent builds professional subject and body', () => {
  const content = buildPasswordResetOtpEmailContent({
    otp: '482731',
    enterpriseName: 'Digify LLC',
    email: 'candidate@example.com'
  });
  assert.equal(content.subject, 'Digify LLC Careers — Password Reset Verification');
  assert.match(content.text, /Digify LLC Careers/);
  assert.match(content.text, /482731/);
  assert.match(content.html, /482731/);
  assert.match(content.html, /Verification code/);
});

test('mapPasswordResetPackageFailure returns null for SUCCESS', () => {
  assert.equal(mapPasswordResetPackageFailure('SUCCESS', 'ok', 'fallback'), null);
  assert.equal(mapPasswordResetPackageFailure('S', 'ok', 'fallback'), null);
});

test('resolvePasswordResetPackageResult requires candidate_user_guid when configured', () => {
  const missingGuid = resolvePasswordResetPackageResult(
    { result_code: 'SUCCESS', result_message: 'ok', candidate_user_guid: null },
    'fallback',
    { requireCandidateUserGuid: true }
  );
  assert.equal(missingGuid.ok, false);
  assert.equal(missingGuid.httpStatus, 500);

  const okResult = resolvePasswordResetPackageResult(
    {
      result_code: 'SUCCESS',
      result_message: 'ok',
      candidate_user_guid: '501D19D3B5CF219CE0633519000AF268'
    },
    'fallback',
    { requireCandidateUserGuid: true }
  );
  assert.equal(okResult.ok, true);
});

test('resolvePasswordResetPackageResult maps CANDIDATE_NOT_FOUND', () => {
  const out = resolvePasswordResetPackageResult(
    {
      result_code: 'CANDIDATE_NOT_FOUND',
      result_message: 'This email does not exist with any candidate user.'
    },
    'fallback'
  );
  assert.equal(out.ok, false);
  assert.equal(out.httpStatus, 404);
  assert.equal(out.payload.code, 'CANDIDATE_NOT_FOUND');
});

test('mapPasswordResetPackageFailure maps CANDIDATE_NOT_FOUND to 404', () => {
  const out = mapPasswordResetPackageFailure(
    'CANDIDATE_NOT_FOUND',
    'This email does not exist with any candidate user.',
    'fallback'
  );
  assert.equal(out.httpStatus, 404);
  assert.deepEqual(out.payload, {
    success: false,
    code: 'CANDIDATE_NOT_FOUND',
    message: 'This email does not exist with any candidate user.'
  });
});

test('mapPasswordResetPackageFailure maps ACCOUNT_INACTIVE and MULTIPLE_CANDIDATE_USERS', () => {
  const inactive = mapPasswordResetPackageFailure(
    'ACCOUNT_INACTIVE',
    'Candidate user account is inactive.',
    'fallback'
  );
  assert.equal(inactive.httpStatus, 403);
  assert.equal(inactive.payload.code, 'ACCOUNT_INACTIVE');

  const multiple = mapPasswordResetPackageFailure('MULTIPLE_CANDIDATE_USERS', '', 'fallback');
  assert.equal(multiple.httpStatus, 409);
  assert.equal(multiple.payload.code, 'MULTIPLE_CANDIDATE_USERS');
  assert.equal(
    multiple.payload.message,
    'Multiple candidate user accounts exist with this email address.'
  );
});

test('validateForgotPasswordBody accepts valid email and normalizes lowercase', () => {
  const out = validateForgotPasswordBody({
    enterprise_id: 1,
    email: '  Candidate@Example.COM '
  });
  assert.deepEqual(out, { enterprise_id: 1, email: 'candidate@example.com' });
});

test('validateForgotPasswordBody rejects invalid email format', () => {
  assert.throws(
    () => validateForgotPasswordBody({ enterprise_id: 1, email: 'not-an-email' }),
    ValidationError
  );
});

test('validateForgotPasswordBody requires enterprise_id and email', () => {
  assert.throws(() => validateForgotPasswordBody({ email: 'a@b.com' }), ValidationError);
  assert.throws(() => validateForgotPasswordBody({ enterprise_id: 1 }), ValidationError);
});

test('validateVerifyResetOtpBody requires 6-digit otp', () => {
  assert.throws(
    () =>
      validateVerifyResetOtpBody({
        enterprise_id: 1,
        email: 'a@b.com',
        otp: '12345'
      }),
    ValidationError
  );
  assert.throws(
    () =>
      validateVerifyResetOtpBody({
        enterprise_id: 1,
        email: 'a@b.com',
        otp: 'abcdef'
      }),
    ValidationError
  );

  const out = validateVerifyResetOtpBody({
    enterprise_id: 1,
    email: 'A@B.COM',
    otp: '482731'
  });
  assert.equal(out.otp, '482731');
  assert.equal(out.email, 'a@b.com');
});

test('validateResetPasswordBody enforces match and password policy', () => {
  assert.throws(
    () =>
      validateResetPasswordBody({
        reset_token: 'abc',
        new_password: 'short1!',
        confirm_password: 'short1!'
      }),
    ValidationError
  );

  assert.throws(
    () =>
      validateResetPasswordBody({
        reset_token: 'abc',
        new_password: 'NewSecurePassword@123',
        confirm_password: 'Different@123'
      }),
    (err) =>
      err instanceof ValidationError &&
      String(err.errors?.[0] || err.message).includes('do not match')
  );

  const out = validateResetPasswordBody({
    reset_token: ' tok ',
    new_password: 'NewSecurePassword@123',
    confirm_password: 'NewSecurePassword@123'
  });
  assert.equal(out.reset_token, 'tok');
});

test('generateSecureOtp returns 6 numeric digits', () => {
  for (let i = 0; i < 20; i += 1) {
    const otp = generateSecureOtp();
    assert.match(otp, /^\d{6}$/);
  }
});

test('OTP store verifies once and rejects reuse', () => {
  storePasswordResetOtp({
    enterprise_id: 1,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'candidate@example.com',
    otp: '482731'
  });

  const ok = verifyPasswordResetOtp(1, 'candidate@example.com', '482731');
  assert.equal(ok.ok, true);
  assert.equal(ok.record.candidate_user_guid, '501D19D3B5CF219CE0633519000AF268');

  const reuse = verifyPasswordResetOtp(1, 'candidate@example.com', '482731');
  assert.equal(reuse.ok, false);
});

test('OTP store increments attempts and locks after max failures', () => {
  storePasswordResetOtp({
    enterprise_id: 2,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'user@example.com',
    otp: '111111'
  });

  for (let i = 0; i < PASSWORD_RESET_OTP_MAX_ATTEMPTS; i += 1) {
    const bad = verifyPasswordResetOtp(2, 'user@example.com', '000000');
    assert.equal(bad.ok, false);
  }

  const afterLock = verifyPasswordResetOtp(2, 'user@example.com', '111111');
  assert.equal(afterLock.ok, false);
});

test('new OTP invalidates previous OTP for same account', () => {
  storePasswordResetOtp({
    enterprise_id: 1,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'a@b.com',
    otp: '111111'
  });
  storePasswordResetOtp({
    enterprise_id: 1,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'a@b.com',
    otp: '222222'
  });

  assert.equal(verifyPasswordResetOtp(1, 'a@b.com', '111111').ok, false);
  assert.equal(verifyPasswordResetOtp(1, 'a@b.com', '222222').ok, true);
});

test('reset token peek/consume and invalidate artifacts', () => {
  const token = generateSecureResetToken();
  storePasswordResetToken({
    enterprise_id: 1,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'a@b.com',
    reset_token: token
  });

  assert.equal(peekPasswordResetToken(token).ok, true);
  const consumed = consumePasswordResetToken(token);
  assert.equal(consumed.ok, true);
  assert.equal(peekPasswordResetToken(token).ok, false);
  assert.equal(consumePasswordResetToken(token).ok, false);
});

test('invalidatePasswordResetArtifacts clears OTP and tokens', () => {
  storePasswordResetOtp({
    enterprise_id: 9,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'z@z.com',
    otp: '999999'
  });
  const token = generateSecureResetToken();
  storePasswordResetToken({
    enterprise_id: 9,
    candidate_user_guid: '501D19D3B5CF219CE0633519000AF268',
    email: 'z@z.com',
    reset_token: token
  });

  invalidatePasswordResetArtifacts(9, 'z@z.com');
  assert.equal(verifyPasswordResetOtp(9, 'z@z.com', '999999').ok, false);
  assert.equal(peekPasswordResetToken(token).ok, false);
});

test('forgot-password rate limit blocks after max requests', () => {
  for (let i = 0; i < PASSWORD_RESET_FORGOT_MAX_REQUESTS; i += 1) {
    assert.equal(checkForgotPasswordRateLimit(1, 'rate@example.com').allowed, true);
    recordForgotPasswordRequest(1, 'rate@example.com');
  }
  assert.equal(checkForgotPasswordRateLimit(1, 'rate@example.com').allowed, false);
});
