import { sendPushNotification } from '../../../services/notifications/notificationService.js';
import {
  isPermanentFirebaseTokenFailure,
  NOTIFICATION_TARGET_TYPES as PUSH_TARGET_TYPES
} from '../../../services/notifications/constants.js';
import {
  isUsableFcmRegistrationToken,
  maskRegistrationToken
} from '../../../services/notifications/utils/payloadUtils.js';
import {
  NOTIFICATION_DELIVERY_STATUS,
  NOTIFICATION_PUSH_STATUS
} from '../constants/notification.constants.js';
import * as notificationRepository from '../repository/notification.repository.js';
import * as notificationDeviceRepository from '../repository/notification.device.repository.js';

const LOG_TAG = 'notification.push';

export function truncatePushErrorMessage(message, max = 3900) {
  if (!message) return null;
  const text = String(message);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function logPush(level, event, details = {}) {
  const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
  logger(`[${LOG_TAG}] ${event}`, details);
}

function recipientContext({ enterpriseId, recipientUserId, recipientId, notification }) {
  return {
    enterpriseId,
    recipientUserId,
    recipientId,
    title: notification?.title ?? null
  };
}

async function updatePushStatus({
  recipientId,
  enterpriseId,
  userId,
  pushStatus,
  deliveryStatus,
  pushErrorMessage = null
}) {
  await notificationRepository.updateRecipientPushStatus({
    recipientId,
    enterpriseId,
    userId,
    pushStatus,
    deliveryStatus,
    pushErrorMessage
  });

  logPush('info', 'recipient push status', {
    enterpriseId,
    userId,
    recipientId,
    pushStatus,
    deliveryStatus,
    pushErrorMessage: pushErrorMessage || null
  });
}

async function deactivateStaleDeviceTarget({ enterpriseId, userId, device }) {
  if (!device?.targetType || !device?.targetValue) return;

  try {
    await notificationDeviceRepository.deactivateNotificationDeviceByTarget({
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: device.targetValue
    });

    logPush('info', 'stale token deactivated', {
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: maskRegistrationToken(device.targetValue)
    });
  } catch (err) {
    logPush('error', 'failed to deactivate stale token', {
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: maskRegistrationToken(device.targetValue),
      message: err?.message || err
    });
  }
}

async function sendToTarget({ enterpriseId, recipientUserId, recipientId, notification, target }) {
  try {
    const pushResult = await sendPushNotification({
      targetType: target.targetType || PUSH_TARGET_TYPES.TOKEN,
      targetValue: target.targetValue,
      title: notification.title,
      body: notification.message,
      actionUrl: notification.actionUrl,
      data: {
        module: notification.module,
        notificationType: notification.type,
        notificationGuid: notification.notificationGuid,
        recipientGuid: notification.recipientGuid,
        ...(notification.metadata && typeof notification.metadata === 'object'
          ? notification.metadata
          : {})
      }
    });

    if (pushResult.success) {
      logPush('info', 'FCM accepted send', {
        ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
        deviceType: target.deviceType ?? null,
        targetType: target.targetType ?? PUSH_TARGET_TYPES.TOKEN,
        targetValue: maskRegistrationToken(target.targetValue),
        messageId: pushResult.messageId ?? null
      });
      return { ok: true };
    }

    const error = pushResult.message || pushResult.errorCode || 'Firebase push failed';
    logPush('error', 'FCM rejected send', {
      ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
      deviceType: target.deviceType ?? null,
      targetValue: maskRegistrationToken(target.targetValue),
      error,
      firebaseCode: pushResult.firebaseCode ?? null
    });

    if (isPermanentFirebaseTokenFailure(pushResult.firebaseCode)) {
      await deactivateStaleDeviceTarget({
        enterpriseId,
        userId: recipientUserId,
        device: target
      });
    }

    return { ok: false, error };
  } catch (err) {
    const message = err?.message || String(err);
    logPush('error', 'token send threw', {
      ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
      targetType: target.targetType,
      targetValue: maskRegistrationToken(target.targetValue),
      message
    });
    return { ok: false, error: message };
  }
}

export async function deliverPushForRecipient({
  enterpriseId,
  recipientUserId,
  recipientId,
  notification
}) {
  const targets = await notificationDeviceRepository.getActiveNotificationTargets({
    enterpriseId,
    userId: recipientUserId
  });

  const usableTargets = targets.filter((target) =>
    isUsableFcmRegistrationToken(target?.targetValue)
  );

  logPush('info', 'devices for recipient', {
    ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
    registeredDevices: targets.length,
    usableTokens: usableTargets.length,
    tokens: usableTargets.map((target) => ({
      deviceType: target.deviceType ?? null,
      targetType: target.targetType ?? null,
      targetValue: maskRegistrationToken(target.targetValue)
    }))
  });

  if (!usableTargets.length) {
    logPush('warn', 'skipped — no usable FCM token', {
      ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
      registeredDevices: targets.length
    });
    await updatePushStatus({
      recipientId,
      enterpriseId,
      userId: recipientUserId,
      pushStatus: NOTIFICATION_PUSH_STATUS.SKIPPED,
      deliveryStatus: NOTIFICATION_DELIVERY_STATUS.SKIPPED,
      pushErrorMessage: 'No active notification devices registered'
    });
    return;
  }

  let lastError = null;
  let sentCount = 0;

  for (const target of usableTargets) {
    const result = await sendToTarget({
      enterpriseId,
      recipientUserId,
      recipientId,
      notification,
      target
    });
    if (result.ok) sentCount += 1;
    else lastError = result.error;
  }

  if (sentCount > 0) {
    await updatePushStatus({
      recipientId,
      enterpriseId,
      userId: recipientUserId,
      pushStatus: NOTIFICATION_PUSH_STATUS.SENT,
      deliveryStatus: NOTIFICATION_DELIVERY_STATUS.SENT
    });
    return;
  }

  logPush('error', 'delivery failed', {
    ...recipientContext({ enterpriseId, recipientUserId, recipientId, notification }),
    error: lastError
  });

  await updatePushStatus({
    recipientId,
    enterpriseId,
    userId: recipientUserId,
    pushStatus: NOTIFICATION_PUSH_STATUS.FAILED,
    deliveryStatus: NOTIFICATION_DELIVERY_STATUS.FAILED,
    pushErrorMessage: truncatePushErrorMessage(lastError)
  });
}

export async function finalizePushDelivery({
  enterpriseId,
  recipientUserId,
  recipientId,
  pushRequired,
  notification,
  fallbackNotification
}) {
  if (!recipientId) return;

  if (!pushRequired) {
    logPush('info', 'skipped — pushRequired is false', {
      enterpriseId,
      recipientUserId,
      recipientId
    });
    await updatePushStatus({
      recipientId,
      enterpriseId,
      userId: recipientUserId,
      pushStatus: NOTIFICATION_PUSH_STATUS.SKIPPED,
      deliveryStatus: NOTIFICATION_DELIVERY_STATUS.SKIPPED
    });
    return;
  }

  try {
    await deliverPushForRecipient({
      enterpriseId,
      recipientUserId,
      recipientId,
      notification: notification ?? fallbackNotification
    });
  } catch (err) {
    logPush('error', 'unexpected delivery error', {
      enterpriseId,
      recipientUserId,
      recipientId,
      message: err?.message || err
    });

    await updatePushStatus({
      recipientId,
      enterpriseId,
      userId: recipientUserId,
      pushStatus: NOTIFICATION_PUSH_STATUS.FAILED,
      deliveryStatus: NOTIFICATION_DELIVERY_STATUS.FAILED,
      pushErrorMessage: truncatePushErrorMessage(err?.message || err)
    });
  }
}
