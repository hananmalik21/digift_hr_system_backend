import { NOTIFICATION_ERROR_CODES } from './constants.js';

export class NotificationError extends Error {
  constructor(message, { code = NOTIFICATION_ERROR_CODES.INVALID_MESSAGE, cause = null } = {}) {
    super(message);
    this.name = 'NotificationError';
    this.code = code;
    this.cause = cause;
  }
}

export class NotificationSendError extends NotificationError {
  constructor(message, { code = NOTIFICATION_ERROR_CODES.SEND_FAILED, cause = null } = {}) {
    super(message, { code, cause });
    this.name = 'NotificationSendError';
  }
}
