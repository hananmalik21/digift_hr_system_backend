import { sendPushNotification } from '../../../services/notifications/notificationService.js';
import {
  isPermanentFirebaseTokenFailure,
  NOTIFICATION_TARGET_TYPES as PUSH_TARGET_TYPES
} from '../../../services/notifications/constants.js';
import { maskRegistrationToken } from '../../../services/notifications/utils/payloadUtils.js';
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
}

async function deactivateStaleDeviceTarget({ enterpriseId, userId, device }) {
  if (!device?.targetType || !device?.targetValue) {
    return;
  }

  try {
    await notificationDeviceRepository.deactivateNotificationDeviceByTarget({
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: device.targetValue
    });

    console.info(`[${LOG_TAG}] stale token deactivated`, {
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: maskRegistrationToken(device.targetValue)
    });
  } catch (err) {
    console.error(`[${LOG_TAG}] failed to deactivate stale token`, {
      enterpriseId,
      userId,
      targetType: device.targetType,
      targetValue: maskRegistrationToken(device.targetValue),
      message: err?.message || err
    });
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

  if (!targets.length) {
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

  for (const target of targets) {
    if (!target?.targetValue) continue;

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
      sentCount += 1;
      continue;
    }

    lastError = pushResult.message || pushResult.errorCode || 'Firebase push failed';

    if (isPermanentFirebaseTokenFailure(pushResult.firebaseCode)) {
      await deactivateStaleDeviceTarget({
        enterpriseId,
        userId: recipientUserId,
        device: target
      });
    }
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

  console.error(`[${LOG_TAG}] delivery failed`, {
    enterpriseId,
    recipientUserId,
    recipientId,
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
  if (!recipientId) {
    return;
  }

  if (!pushRequired) {
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
    console.error(`[${LOG_TAG}] unexpected delivery error`, {
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
