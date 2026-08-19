import { LOG_TAG } from '../constants.js';
import { maskRegistrationToken } from './payloadUtils.js';

export function logNotificationInfo(event, details = {}) {
  console.info(`[${LOG_TAG}] ${event}`, details);
}

export function logNotificationError(event, details = {}) {
  console.error(`[${LOG_TAG}] ${event}`, details);
}

export function logPushAttempt({ targetType, targetValue, channel = 'firebase' }) {
  logNotificationInfo('push.send.attempt', {
    channel,
    targetType,
    targetValue: maskRegistrationToken(targetValue)
  });
}

export function logPushFailure({
  targetType,
  targetValue,
  channel = 'firebase',
  code = null,
  message = null
}) {
  logNotificationError('push.send.failed', {
    channel,
    targetType,
    targetValue: maskRegistrationToken(targetValue),
    code,
    message
  });
}

export function logPushSuccess({ targetType, targetValue, channel = 'firebase', messageId }) {
  logNotificationInfo('push.send.success', {
    channel,
    targetType,
    targetValue: maskRegistrationToken(targetValue),
    messageId
  });
}
