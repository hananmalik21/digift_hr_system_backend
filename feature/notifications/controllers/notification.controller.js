import { asyncHandler } from '@digifyhr/common';
import {
  getActingEnterpriseId,
  getActingUserId,
  getActingUsername,
  requireActingUserId
} from '../../../utils/userContext.js';
import { notificationService } from '../service/notification.service.js';
import { NOTIFICATION_ERROR_CODES } from '../constants/notification.constants.js';
import {
  clearNotificationsQuerySchema,
  createNotificationBodySchema,
  deactivateDeviceBodySchema,
  deviceGuidParamSchema,
  firstValidationIssueMessage,
  listNotificationsQuerySchema,
  parseWithSchema,
  recipientGuidParamSchema,
  registerDeviceBodySchema
} from '../validation/notification.validator.js';
import {
  sendNotificationFailure,
  sendNotificationSuccess
} from '../utils/notification.response.js';

function resolveScope(req, res) {
  const userId = requireActingUserId(req, res);
  if (userId == null) return null;

  const enterpriseId = getActingEnterpriseId(req);
  if (!enterpriseId) {
    sendNotificationFailure(res, {
      statusCode: 400,
      message: 'Authenticated enterprise context is required',
      errorCode: 'ENTERPRISE_REQUIRED'
    });
    return null;
  }

  return { enterpriseId, userId };
}

function validationFailure(res, zodError, fallback, errorCode = null) {
  return sendNotificationFailure(res, {
    statusCode: 400,
    message: firstValidationIssueMessage(zodError, fallback),
    errorCode
  });
}

function parseOrFail(res, schema, input, fallback, errorCode = null) {
  const parsed = parseWithSchema(schema, input);
  if (!parsed.success) {
    validationFailure(res, parsed.error, fallback, errorCode);
    return null;
  }
  return parsed.data;
}

export const listNotifications = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const query = parseOrFail(res, listNotificationsQuerySchema, req.query, 'Invalid query parameters');
  if (!query) return;

  const result = await notificationService.listNotificationsForUser(scope, query);

  return sendNotificationSuccess(res, {
    message: 'Notifications fetched successfully',
    data: result
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const result = await notificationService.getUnreadCountForUser(scope);

  return sendNotificationSuccess(res, {
    message: 'Unread notification count fetched successfully',
    data: result
  });
});

export const markNotificationRead = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const params = parseOrFail(res, recipientGuidParamSchema, req.params, 'Invalid recipientGuid');
  if (!params) return;

  const result = await notificationService.markNotificationRead(
    scope,
    params.recipientGuid
  );

  return sendNotificationSuccess(res, {
    message: result.message
  });
});

export const markAllNotificationsRead = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const result = await notificationService.markAllNotificationsRead(scope);

  return sendNotificationSuccess(res, {
    message: result.message,
    data: { rowsUpdated: result.rowsUpdated }
  });
});

export const clearNotifications = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const query = parseOrFail(res, clearNotificationsQuerySchema, req.query, 'Invalid clear type');
  if (!query) return;

  const result = await notificationService.clearNotificationsForUser(scope, query.type);

  return sendNotificationSuccess(res, {
    message: result.message,
    data: { rowsCleared: result.rowsCleared }
  });
});

export const clearOneNotification = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const params = parseOrFail(res, recipientGuidParamSchema, req.params, 'Invalid recipientGuid');
  if (!params) return;

  const result = await notificationService.clearOneNotification(
    scope,
    params.recipientGuid
  );

  return sendNotificationSuccess(res, {
    message: result.message
  });
});

export const createNotification = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const body = parseOrFail(res, createNotificationBodySchema, req.body, 'Invalid request body');
  if (!body) return;

  const result = await notificationService.createNotification(scope, body, {
    createdBy: getActingUsername(req) ?? String(getActingUserId(req) ?? 'SYSTEM')
  });

  return sendNotificationSuccess(res, {
    statusCode: 201,
    message: result.message,
    data: { notification: result.notification }
  });
});

export const registerDevice = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const body = parseOrFail(
    res,
    registerDeviceBodySchema,
    req.body,
    'Invalid request body',
    NOTIFICATION_ERROR_CODES.INVALID_NOTIFICATION_TARGET
  );
  if (!body) return;

  const result = await notificationService.registerDevice(scope, body);

  return sendNotificationSuccess(res, {
    statusCode: 201,
    message: result.message,
    data: result.device
  });
});

export const deactivateDeviceByTarget = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const body = parseOrFail(
    res,
    deactivateDeviceBodySchema,
    req.body,
    'Invalid request body',
    NOTIFICATION_ERROR_CODES.INVALID_NOTIFICATION_TARGET
  );
  if (!body) return;

  const result = await notificationService.deactivateDeviceByTarget(scope, body);

  return sendNotificationSuccess(res, {
    message: result.message
  });
});

export const deactivateDevice = asyncHandler(async (req, res) => {
  const scope = resolveScope(req, res);
  if (!scope) return;

  const params = parseOrFail(res, deviceGuidParamSchema, req.params, 'Invalid deviceGuid');
  if (!params) return;

  const result = await notificationService.deactivateDevice(scope, params.deviceGuid);

  return sendNotificationSuccess(res, {
    message: result.message
  });
});
