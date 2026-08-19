import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  NotificationError,
  NOTIFICATION_ERROR_CODES,
  sendPushNotification
} from '../../../../services/notifications/index.js';
import { isFirebaseTestEndpointEnabled } from '../constants.js';
import {
  firebaseTestNotificationSchema,
  firstIssueMessage
} from '../validation/firebaseTestNotification.validation.js';

function sendNotFound(res) {
  return res.status(404).json({
    success: false,
    message: 'Not found'
  });
}

export function requireFirebaseTestEndpointEnabled(req, res, next) {
  if (!isFirebaseTestEndpointEnabled()) {
    return sendNotFound(res);
  }
  return next();
}

export const testFirebaseNotificationHandler = asyncHandler(async (req, res) => {
  const parsed = firebaseTestNotificationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: firstIssueMessage(parsed.error, 'Invalid request body')
    });
  }

  try {
    const result = await sendPushNotification(parsed.data);

    if (!result.success) {
      return res.status(502).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    if (
      err instanceof NotificationError &&
      err.code === NOTIFICATION_ERROR_CODES.UNSUPPORTED_TARGET_TYPE
    ) {
      return res.status(400).json({
        success: false,
        message: err.message,
        errorCode: err.code
      });
    }

    if (err instanceof NotificationError) {
      return res.status(400).json({
        success: false,
        message: err.message,
        errorCode: err.code
      });
    }

    return res.status(400).json({
      success: false,
      message: err?.message || 'Invalid notification request'
    });
  }
});
