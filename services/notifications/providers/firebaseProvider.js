import { getFirebaseMessaging } from '../../../config/firebase.js';
import {
  NOTIFICATION_ERROR_CODES,
  NOTIFICATION_MESSAGES,
  NOTIFICATION_TARGET_TYPES
} from '../constants.js';
import { NotificationError } from '../errors.js';
import {
  buildWebPushLink,
  maskRegistrationToken,
  stringifyNotificationData
} from '../utils/payloadUtils.js';
import {
  logPushFailure,
  logPushSuccess
} from '../utils/loggingUtils.js';

const CHANNEL = 'firebase';

function resolveMessageTarget({ targetType, targetValue }) {
  switch (targetType) {
    case NOTIFICATION_TARGET_TYPES.TOKEN:
      return { token: targetValue };
    case NOTIFICATION_TARGET_TYPES.FID:
      throw new NotificationError('FID target type is not supported yet', {
        code: NOTIFICATION_ERROR_CODES.UNSUPPORTED_TARGET_TYPE
      });
    default:
      throw new NotificationError(`Unsupported targetType: ${targetType}`, {
        code: NOTIFICATION_ERROR_CODES.UNSUPPORTED_TARGET_TYPE
      });
  }
}

function buildFirebaseMessage({
  targetType,
  targetValue,
  title,
  body,
  data,
  actionUrl
}) {
  const message = {
    ...resolveMessageTarget({ targetType, targetValue }),
    notification: {
      title,
      body
    },
    data: stringifyNotificationData(data)
  };

  const link = buildWebPushLink(actionUrl);
  if (link) {
    message.webpush = {
      fcmOptions: {
        link
      }
    };
  }

  return message;
}

function buildSendFailureResult(err) {
  return {
    success: false,
    channel: CHANNEL,
    message: NOTIFICATION_MESSAGES.FIREBASE_SEND_FAILED,
    errorCode: NOTIFICATION_ERROR_CODES.FIREBASE_SEND_FAILED,
    firebaseCode: err?.code || null
  };
}

function buildSendSuccessResult(messageId) {
  return {
    success: true,
    channel: CHANNEL,
    message: NOTIFICATION_MESSAGES.FIREBASE_SEND_SUCCESS,
    messageId
  };
}

/**
 * Firebase Cloud Messaging provider.
 * Used by the global notification service; do not call directly from feature modules.
 */
export async function sendFirebasePushNotification({
  targetType,
  targetValue,
  title,
  body,
  data = {},
  actionUrl
}) {
  const messaging = getFirebaseMessaging();

  let message;
  try {
    message = buildFirebaseMessage({
      targetType,
      targetValue,
      title,
      body,
      data,
      actionUrl
    });
  } catch (err) {
    logPushFailure({
      targetType,
      targetValue,
      channel: CHANNEL,
      code: err?.code || NOTIFICATION_ERROR_CODES.INVALID_MESSAGE,
      message: err?.message || String(err)
    });

    if (err instanceof NotificationError) {
      throw err;
    }

    throw new NotificationError(err?.message || 'Invalid notification payload', {
      code: NOTIFICATION_ERROR_CODES.INVALID_MESSAGE,
      cause: err
    });
  }

  try {
    const messageId = await messaging.send(message);
    logPushSuccess({ targetType, targetValue, channel: CHANNEL, messageId });
    return buildSendSuccessResult(messageId);
  } catch (err) {
    logPushFailure({
      targetType,
      targetValue,
      channel: CHANNEL,
      code: err?.code || null,
      message: err?.message || String(err)
    });
    return buildSendFailureResult(err);
  }
}

export { maskRegistrationToken as maskFirebaseRegistrationToken };
