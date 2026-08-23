import { guidToBuffer } from '../../../src/utils/oracleGuid.js';
import { maskRegistrationToken } from '../../../services/notifications/utils/payloadUtils.js';
import { AppError, NotFoundError, ValidationError } from '../../../utils/errors/index.js';
import {
  NOTIFICATION_DEVICE_MESSAGES,
  NOTIFICATION_ERROR_CODES
} from '../constants/notification.constants.js';
import { buildPaginationMeta, mapDevicePublicResponse } from '../utils/notification.mapper.js';
import {
  resolveEnterpriseScope,
  resolveNotificationScope
} from '../utils/notification.scope.js';
import { persistNotificationForUser } from '../utils/notification.create.js';
import * as notificationRepository from '../repository/notification.repository.js';
import * as notificationDeviceRepository from '../repository/notification.device.repository.js';
import { finalizePushDelivery } from './notification.push.js';

const DEVICE_LOG_TAG = 'notification.device';

function parseRecipientGuidBuffer(recipientGuidHex) {
  const recipientGuidBuffer = guidToBuffer(recipientGuidHex);
  if (!recipientGuidBuffer) {
    throw new ValidationError('recipientGuid must be a valid 32-character hex GUID');
  }
  return recipientGuidBuffer;
}

async function assertRecipientInEnterprise(enterpriseId, recipientUserId) {
  const exists = await notificationRepository.userExistsInEnterprise({
    enterpriseId,
    userId: recipientUserId
  });

  if (!exists) {
    throw new ValidationError('Recipient user was not found in the current enterprise', [
      {
        field: 'recipientUserId',
        message: 'Recipient user must belong to the authenticated enterprise'
      }
    ]);
  }
}

function logDeviceEvent(level, event, { enterpriseId, userId, targetType, targetValue, deviceType, deviceGuid, message }) {
  const payload = {
    enterpriseId,
    userId,
    ...(deviceType ? { deviceType } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetValue ? { targetValue: maskRegistrationToken(targetValue) } : {}),
    ...(deviceGuid ? { deviceGuid } : {}),
    ...(message ? { message } : {})
  };

  if (level === 'error') {
    console.error(`[${DEVICE_LOG_TAG}] ${event}`, payload);
    return;
  }

  console.info(`[${DEVICE_LOG_TAG}] ${event}`, payload);
}

function rethrowDeviceFailure(err, code, userMessage, logContext) {
  if (err instanceof ValidationError || err instanceof NotFoundError) {
    throw err;
  }

  if (err instanceof AppError && err.code !== 'DATABASE_ERROR') {
    throw err;
  }

  logDeviceEvent('error', 'failed', {
    ...logContext,
    message: err?.message || err
  });

  throw new AppError(userMessage, 500, code, err?.technicalMessage || err?.message || String(err));
}

export async function listNotificationsForUser(scope, query) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const viewAll = scope.viewAll === true;

  const filters = {
    enterpriseId,
    userId,
    viewAll,
    status: query.status,
    module: query.module ?? null,
    type: query.type ?? null,
    priority: query.priority ?? null
  };

  const pagination = {
    page: query.page,
    limit: query.limit
  };

  const [total, notifications] = await Promise.all([
    notificationRepository.countNotifications(filters),
    notificationRepository.listNotifications(filters, pagination)
  ]);

  return {
    notifications,
    viewAll,
    pagination: buildPaginationMeta({
      page: pagination.page,
      limit: pagination.limit,
      total
    })
  };
}

export async function getUnreadCountForUser(scope) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const unreadCount = await notificationRepository.getUnreadCount({
    enterpriseId,
    userId,
    viewAll: scope.viewAll === true
  });
  return { unreadCount };
}

export async function markNotificationRead(scope, recipientGuidHex) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const recipientGuidBuffer = parseRecipientGuidBuffer(recipientGuidHex);

  const result = await notificationRepository.markRecipientRead({
    enterpriseId,
    userId,
    recipientGuidBuffer
  });

  if (result.notFound) {
    throw new NotFoundError('Notification not found', NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND);
  }

  return { message: 'Notification marked as read' };
}

export async function markAllNotificationsRead(scope) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const rowsUpdated = await notificationRepository.markAllRecipientsRead({ enterpriseId, userId });

  return {
    message: 'All notifications marked as read',
    rowsUpdated
  };
}

export async function clearNotificationsForUser(scope, clearType) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const rowsCleared = await notificationRepository.clearNotificationsViaPackage({
    enterpriseId,
    userId,
    clearType
  });

  return {
    message: 'Notifications cleared',
    rowsCleared
  };
}

export async function clearOneNotification(scope, recipientGuidHex) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const recipientGuidBuffer = parseRecipientGuidBuffer(recipientGuidHex);

  const result = await notificationRepository.dismissRecipient({
    enterpriseId,
    userId,
    recipientGuidBuffer
  });

  if (result.notFound) {
    throw new NotFoundError('Notification not found', NOTIFICATION_ERROR_CODES.NOTIFICATION_NOT_FOUND);
  }

  return { message: 'Notification cleared' };
}

/**
 * Internal create path for workflow modules (leave, payroll, etc.).
 * Requires enterprise + recipient validation only — no acting user scope.
 */
export async function createNotificationForEnterprise({
  enterpriseId,
  createdBy = null,
  recipientUserId,
  recipientEmployeeId = null,
  module,
  type,
  title,
  message,
  priority,
  entity,
  actionUrl,
  iconCode,
  metadata,
  pushRequired = false
}) {
  const { enterpriseId: resolvedEnterpriseId } = resolveEnterpriseScope(enterpriseId);
  await assertRecipientInEnterprise(resolvedEnterpriseId, recipientUserId);

  const { createResult, notification } = await persistNotificationForUser({
    enterpriseId: resolvedEnterpriseId,
    recipientUserId,
    recipientEmployeeId,
    module,
    type,
    title,
    message,
    priority,
    entity,
    actionUrl,
    iconCode,
    metadata,
    pushRequired,
    createdBy
  });

  if (!createResult?.recipientId) {
    throw new AppError(
      createResult?.message || 'Notification was not created for the recipient',
      500,
      NOTIFICATION_ERROR_CODES.NOTIFICATION_CREATE_FAILED
    );
  }

  await finalizePushDelivery({
    enterpriseId: resolvedEnterpriseId,
    recipientUserId,
    recipientId: createResult.recipientId,
    pushRequired,
    notification,
    fallbackNotification: {
      title,
      message,
      actionUrl: actionUrl ?? null,
      module,
      type,
      metadata: metadata ?? null,
      notificationGuid: null,
      recipientGuid: null
    }
  });

  return {
    message: createResult.message || 'Notification created successfully',
    notification
  };
}

export async function createNotification(scope, body, audit) {
  const { enterpriseId } = resolveNotificationScope(scope);
  await assertRecipientInEnterprise(enterpriseId, body.recipientUserId);

  return createNotificationForEnterprise({
    enterpriseId,
    createdBy: audit.createdBy,
    recipientUserId: body.recipientUserId,
    recipientEmployeeId: body.recipientEmployeeId ?? null,
    module: body.module,
    type: body.type,
    title: body.title,
    message: body.message,
    priority: body.priority,
    entity: body.entity ?? {},
    actionUrl: body.actionUrl ?? null,
    iconCode: body.iconCode ?? null,
    metadata: body.metadata ?? null,
    pushRequired: body.pushRequired ?? false
  });
}

export async function registerDevice(scope, body) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const logContext = {
    enterpriseId,
    userId,
    deviceType: body.deviceType,
    targetType: body.targetType,
    targetValue: body.targetValue
  };

  try {
    const device = await notificationDeviceRepository.registerNotificationDevice({
      enterpriseId,
      userId,
      targetType: body.targetType,
      targetValue: body.targetValue,
      deviceType: body.deviceType,
      deviceName: body.deviceName ?? null,
      browserName: body.browserName ?? null,
      browserVersion: body.browserVersion ?? null,
      operatingSystem: body.operatingSystem ?? null
    });

    if (!device) {
      throw new AppError(
        NOTIFICATION_DEVICE_MESSAGES.REGISTER_FAILED,
        500,
        NOTIFICATION_ERROR_CODES.NOTIFICATION_DEVICE_REGISTER_FAILED
      );
    }

    logDeviceEvent('info', 'registered', logContext);

    return {
      message: NOTIFICATION_DEVICE_MESSAGES.REGISTERED,
      device: mapDevicePublicResponse(device)
    };
  } catch (err) {
    rethrowDeviceFailure(
      err,
      NOTIFICATION_ERROR_CODES.NOTIFICATION_DEVICE_REGISTER_FAILED,
      NOTIFICATION_DEVICE_MESSAGES.REGISTER_FAILED,
      logContext
    );
  }
}

export async function deactivateDeviceByTarget(scope, body) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const logContext = {
    enterpriseId,
    userId,
    targetType: body.targetType,
    targetValue: body.targetValue
  };

  try {
    await notificationDeviceRepository.deactivateNotificationDeviceByTarget({
      enterpriseId,
      userId,
      targetType: body.targetType,
      targetValue: body.targetValue
    });

    logDeviceEvent('info', 'deactivated by target', logContext);
    return { message: NOTIFICATION_DEVICE_MESSAGES.DEACTIVATED };
  } catch (err) {
    rethrowDeviceFailure(
      err,
      NOTIFICATION_ERROR_CODES.NOTIFICATION_DEVICE_DEACTIVATE_FAILED,
      NOTIFICATION_DEVICE_MESSAGES.DEACTIVATE_FAILED,
      logContext
    );
  }
}

export async function deactivateDevice(scope, deviceGuidHex) {
  const { enterpriseId, userId } = resolveNotificationScope(scope);
  const deviceGuidBuffer = guidToBuffer(deviceGuidHex);

  if (!deviceGuidBuffer) {
    throw new ValidationError('deviceGuid must be a valid 32-character hex GUID');
  }

  try {
    const result = await notificationDeviceRepository.deactivateNotificationDevice({
      enterpriseId,
      userId,
      deviceGuidBuffer
    });

    if (result.notFound) {
      throw new NotFoundError('Notification device not found', NOTIFICATION_ERROR_CODES.DEVICE_NOT_FOUND);
    }

    logDeviceEvent('info', 'deactivated by guid', { enterpriseId, userId, deviceGuid: deviceGuidHex });
    return { message: NOTIFICATION_DEVICE_MESSAGES.DEACTIVATED };
  } catch (err) {
    rethrowDeviceFailure(
      err,
      NOTIFICATION_ERROR_CODES.NOTIFICATION_DEVICE_DEACTIVATE_FAILED,
      NOTIFICATION_DEVICE_MESSAGES.DEACTIVATE_FAILED,
      { enterpriseId, userId, deviceGuid: deviceGuidHex }
    );
  }
}

export const notificationService = {
  listNotificationsForUser,
  getUnreadCountForUser,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotificationsForUser,
  clearOneNotification,
  createNotification,
  createNotificationForEnterprise,
  registerDevice,
  deactivateDeviceByTarget,
  deactivateDevice
};
