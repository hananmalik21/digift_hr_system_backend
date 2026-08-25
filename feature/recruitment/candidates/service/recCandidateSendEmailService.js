import { sendEmail } from '../../../../services/email.service.js';
import { getCandidateByGuidFromView } from '../model/recCandidateViewModel.js';
import { parseCandidateGuidParam } from '../utils/recCandidateValidators.js';
import { CANDIDATE_SEND_EMAIL_ERROR } from '../utils/recCandidateSendEmailConstants.js';
import {
  buildPlainTextEmailHtml,
  mapAttachmentMeta
} from '../utils/recCandidateSendEmailContent.js';
import { validateSendCandidateEmailBody } from '../utils/recCandidateSendEmailValidators.js';

/**
 * Send an email to a candidate (Send Message modal).
 * @param {{
 *   candidateGuidParam: string,
 *   body: Record<string, unknown>,
 *   attachments?: Array<{ filename: string, content: Buffer, contentType: string, size: number }>
 * }} input
 * @returns {Promise<{ httpStatus: number, payload: Record<string, unknown> }>}
 */
export async function sendCandidateEmail({
  candidateGuidParam,
  body,
  attachments = []
}) {
  const candidate_guid = parseCandidateGuidParam(candidateGuidParam);
  const payload = validateSendCandidateEmailBody(
    { ...(body || {}), candidate_guid },
    candidate_guid
  );

  const candidate = await getCandidateByGuidFromView(
    candidate_guid,
    payload.enterprise_id
  );
  if (!candidate) {
    return {
      httpStatus: 404,
      payload: { success: false, message: 'Candidate not found.' }
    };
  }

  const to = String(candidate.email ?? '').trim();
  if (!to) {
    return {
      httpStatus: 400,
      payload: {
        success: false,
        message: 'Candidate does not have an email address.'
      }
    };
  }

  const result = await sendEmail({
    to,
    subject: payload.subject,
    text: payload.message,
    html: buildPlainTextEmailHtml(payload.message),
    attachments
  });

  if (!result.success) {
    return {
      httpStatus: 500,
      payload: {
        success: false,
        status: 'ERROR',
        message: result.error || CANDIDATE_SEND_EMAIL_ERROR
      }
    };
  }

  return {
    httpStatus: 200,
    payload: {
      success: true,
      status: 'SUCCESS',
      message: 'Email sent successfully',
      data: {
        candidate_guid,
        to,
        candidate_name: candidate.full_name ?? null,
        subject: payload.subject,
        message_type: payload.message_type,
        template: payload.template,
        attachments: mapAttachmentMeta(attachments),
        messageId: result.messageId
      }
    }
  };
}
