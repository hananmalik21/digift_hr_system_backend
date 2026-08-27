/**
 * Main Digify HR user password-reset email content (not career portal).
 */

import { escapeHtml } from '../../../recruitment/candidates/utils/recCandidateSendEmailContent.js';

/**
 * @param {unknown} enterpriseName
 * @returns {string}
 */
export function formatEnterpriseBrandName(enterpriseName) {
  const name = String(enterpriseName ?? '').trim();
  return name || 'Digify HR';
}

/**
 * @param {unknown} enterpriseName
 * @returns {string}
 */
export function buildFndsecPasswordResetEmailSubject(enterpriseName) {
  const brand = formatEnterpriseBrandName(enterpriseName);
  if (!String(enterpriseName ?? '').trim()) {
    return 'Password Reset Verification Code';
  }
  return `${brand} — Password Reset Verification`;
}

/**
 * @param {{ otp: string, enterpriseName?: string|null, email?: string|null }} input
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildFndsecPasswordResetOtpEmailContent(input) {
  const brand = formatEnterpriseBrandName(input.enterpriseName);
  const otp = String(input.otp ?? '').trim();
  const subject = buildFndsecPasswordResetEmailSubject(input.enterpriseName);

  const text = [
    'Hello,',
    '',
    `We received a request to reset the password for your ${brand} account` +
      (input.email ? ` (${input.email})` : '') +
      '.',
    '',
    'Use the verification code below to continue. This code expires in 10 minutes and can be used only once.',
    '',
    `Verification code: ${otp}`,
    '',
    'If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.',
    '',
    'Thank you,',
    brand
  ].join('\n');

  const safeBrand = escapeHtml(brand);
  const safeOtp = escapeHtml(otp);
  const safeEmail = input.email ? escapeHtml(input.email) : '';

  const html = [
    '<div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1f2937; max-width: 560px; margin: 0 auto;">',
    '<p style="margin: 0 0 16px; font-size: 16px;">Hello,</p>',
    `<p style="margin: 0 0 16px; font-size: 15px;">We received a request to reset the password for your <strong>${safeBrand}</strong> account` +
      (safeEmail ? ` (<span style="color:#4b5563;">${safeEmail}</span>)` : '') +
      '.</p>',
    '<p style="margin: 0 0 16px; font-size: 15px;">Use the verification code below to continue. This code expires in <strong>10 minutes</strong> and can be used only once.</p>',
    '<div style="margin: 24px 0; padding: 16px 20px; background: #f3f4f6; border-radius: 8px; text-align: center;">',
    '<p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; letter-spacing: 0.04em; text-transform: uppercase;">Verification code</p>',
    `<p style="margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 0.2em; color: #111827;">${safeOtp}</p>`,
    '</div>',
    '<p style="margin: 0 0 16px; font-size: 14px; color: #4b5563;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>',
    `<p style="margin: 24px 0 0; font-size: 15px;">Thank you,<br><strong>${safeBrand}</strong></p>`,
    '</div>'
  ].join('');

  return { subject, text, html };
}
