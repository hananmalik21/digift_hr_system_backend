import { sendEmail } from '../../../../services/email.service.js';
import { escapeHtml } from '@digifyhr/common';
import { cleanOracleBusinessMessage } from '../utils/recCandidateConversionOracleErrors.js';
import { resolveHrContactEmail } from '../utils/recCandidateTransferHrContacts.js';

const MAX_MESSAGE = 4000;

/**
 * Sanitize a side-effect failure for Oracle / API. No ORA stacks or secrets.
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizeTransferSideEffectMessage(err) {
  const cleaned = cleanOracleBusinessMessage(err);
  const text = cleaned || 'Request failed.';
  return text.slice(0, MAX_MESSAGE);
}

function buildTransferEmailText(context) {
  const lines = [
    'A candidate has been transferred to HR.',
    '',
    `Candidate: ${context.candidateName || context.candidateGuid}`,
    `Offer: ${context.offerNumber || context.offerGuid}`,
    context.jobTitle ? `Job title: ${context.jobTitle}` : null,
    context.startDate ? `Start date: ${context.startDate}` : null,
    context.employeeNumber ? `Employee number: ${context.employeeNumber}` : null,
    context.transferNotes ? `Notes: ${context.transferNotes}` : null
  ].filter((line) => line != null);
  return lines.join('\n');
}

/**
 * Send Transfer to HR notification via the existing email service.
 * Failures must not roll back the committed transfer.
 *
 * @param {{
 *   hrContactId: string|null,
 *   candidateGuid: string,
 *   candidateName?: string|null,
 *   offerGuid: string,
 *   offerNumber?: string|null,
 *   jobTitle?: string|null,
 *   startDate?: string|null,
 *   employeeNumber?: string|null,
 *   transferNotes?: string|null
 * }} context
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function sendTransferNotification(context) {
  const to = resolveHrContactEmail(context.hrContactId);
  if (!to) {
    return {
      success: false,
      error: 'HR contact email is not configured.'
    };
  }

  const text = buildTransferEmailText(context);
  const result = await sendEmail({
    to,
    subject: `Candidate transferred to HR: ${context.candidateName || context.candidateGuid}`,
    text,
    html: `<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">${escapeHtml(text).replace(/\r\n|\r|\n/g, '<br>')}</div>`
  });

  if (result.success) return { success: true };
  return {
    success: false,
    error: sanitizeTransferSideEffectMessage(result.error || 'Email could not be sent.')
  };
}
