import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_ERROR_CODES,
  NOTIFICATION_TARGET_TYPES
} from './constants.js';
import { NotificationError } from './errors.js';
import { sendFirebasePushNotification } from './providers/firebaseProvider.js';
import { logPushAttempt } from './utils/loggingUtils.js';

function normalizePushPayload(payload) {
  return {
    targetType: payload.targetType,
    targetValue: payload.targetValue,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    actionUrl: payload.actionUrl
  };
}

/**
 * Global notification service entry point for push notifications.
 * Feature modules should import from `services/notifications/index.js`.
 */
export async function sendPushNotification(payload) {
  const normalized = normalizePushPayload(payload);

  logPushAttempt({
    targetType: normalized.targetType,
    targetValue: normalized.targetValue,
    channel: NOTIFICATION_CHANNELS.PUSH
  });

  return sendFirebasePushNotification(normalized);
}

/**
 * Convenience helper for the most common push target: a single FCM token.
 */
export async function sendPushToToken({
  token,
  title,
  body,
  data,
  actionUrl
}) {
  if (!token || !String(token).trim()) {
    throw new NotificationError('token is required', {
      code: NOTIFICATION_ERROR_CODES.INVALID_MESSAGE
    });
  }

  return sendPushNotification({
    targetType: NOTIFICATION_TARGET_TYPES.TOKEN,
    targetValue: String(token).trim(),
    title,
    body,
    data,
    actionUrl
  });
}

/**
 * Backward-compatible alias used during migration from firebaseMessagingService.
 */
export const sendFirebaseNotification = sendPushNotification;

export const notificationService = {
  sendPushNotification,
  sendPushToToken,
  sendFirebaseNotification: sendPushNotification
};
