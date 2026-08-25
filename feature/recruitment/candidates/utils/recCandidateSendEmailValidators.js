import {
  asObject,
  isBlank,
  requireNonBlankString,
  requirePositiveEnterpriseId,
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';
import { ALLOWED_MESSAGE_TYPES } from './recCandidateSendEmailConstants.js';

/**
 * Validate Send Message modal body for candidate email.
 * @param {Record<string, unknown>} body
 * @param {string} [candidateGuid]
 * @returns {{ enterprise_id: number, subject: string, message: string, message_type: string, template: string|null }}
 */
export function validateSendCandidateEmailBody(body, candidateGuid) {
  const b = asObject(body);
  const errors = [];

  requirePositiveEnterpriseId(errors, b);
  validateHexGuidInErrors(errors, candidateGuid ?? b.candidate_guid, 'candidate_guid');
  requireNonBlankString(errors, b, 'subject');

  const messageRaw = !isBlank(b.message) ? b.message : b.body;
  if (isBlank(messageRaw)) {
    errors.push('message is required');
  }

  let message_type = 'EMAIL';
  if (!isBlank(b.message_type)) {
    message_type = String(b.message_type).trim().toUpperCase();
    if (!ALLOWED_MESSAGE_TYPES.includes(message_type)) {
      errors.push(`message_type must be one of: ${ALLOWED_MESSAGE_TYPES.join(', ')}`);
    }
  }

  throwIfValidationErrors(errors);

  return {
    enterprise_id: Number(b.enterprise_id),
    subject: String(b.subject).trim(),
    message: String(messageRaw).trim(),
    message_type,
    template: isBlank(b.template) ? null : String(b.template).trim()
  };
}
