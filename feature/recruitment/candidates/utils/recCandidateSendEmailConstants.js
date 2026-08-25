export const CANDIDATE_SEND_EMAIL_ERROR =
  'Unable to send email to candidate. Please try again.';

export const ALLOWED_MESSAGE_TYPES = Object.freeze(['EMAIL']);

export const SEND_EMAIL_FILE_FIELDS = Object.freeze([
  'document',
  'documents',
  'attachment',
  'file'
]);

export const SEND_EMAIL_MAX_FILES = 5;
export const SEND_EMAIL_MAX_FILE_SIZE = 10 * 1024 * 1024;
