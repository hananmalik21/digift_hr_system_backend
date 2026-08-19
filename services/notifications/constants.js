export const NOTIFICATION_CHANNELS = {
  PUSH: 'PUSH'
};

export const NOTIFICATION_TARGET_TYPES = {
  TOKEN: 'TOKEN',
  FID: 'FID'
};

export const SUPPORTED_PUSH_TARGET_TYPES = [
  NOTIFICATION_TARGET_TYPES.TOKEN
];

export const NOTIFICATION_ERROR_CODES = {
  UNSUPPORTED_TARGET_TYPE: 'UNSUPPORTED_TARGET_TYPE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  SEND_FAILED: 'NOTIFICATION_SEND_FAILED',
  FIREBASE_SEND_FAILED: 'FIREBASE_SEND_FAILED'
};

/** Firebase Admin error codes indicating a permanently invalid FCM token. */
export const FIREBASE_INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

export function isPermanentFirebaseTokenFailure(firebaseCode) {
  return Boolean(firebaseCode && FIREBASE_INVALID_TOKEN_CODES.has(firebaseCode));
}

export const NOTIFICATION_MESSAGES = {
  SEND_SUCCESS: 'Notification sent successfully',
  SEND_FAILED: 'Unable to send notification',
  FIREBASE_SEND_SUCCESS: 'Firebase notification sent successfully',
  FIREBASE_SEND_FAILED: 'Unable to send Firebase notification'
};

export const LOG_TAG = 'notification-service';
