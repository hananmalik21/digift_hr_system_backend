import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapDevicePublicResponse,
  mapDeviceRow
} from '../utils/notification.mapper.js';
import {
  deactivateDeviceBodySchema,
  registerDeviceBodySchema
} from '../validation/notification.validator.js';
import { isPermanentFirebaseTokenFailure } from '../../../services/notifications/constants.js';

test('mapDevicePublicResponse omits FCM token', () => {
  const mapped = mapDevicePublicResponse(
    mapDeviceRow({
      DEVICE_ID: 1,
      DEVICE_GUID: 'ABC123',
      TARGET_TYPE: 'TOKEN',
      TARGET_VALUE: 'secret-fcm-token-value',
      DEVICE_TYPE: 'WEB',
      ACTIVE_FLAG: 'Y'
    })
  );

  assert.equal(mapped.deviceGuid, 'ABC123');
  assert.equal(mapped.targetType, 'TOKEN');
  assert.equal(mapped.deviceType, 'WEB');
  assert.equal(mapped.active, true);
  assert.equal(mapped.targetValue, undefined);
});

test('registerDeviceBodySchema rejects empty targetValue', () => {
  const parsed = registerDeviceBodySchema.safeParse({
    targetType: 'TOKEN',
    targetValue: '   ',
    deviceType: 'WEB'
  });

  assert.equal(parsed.success, false);
});

test('registerDeviceBodySchema rejects userId in body', () => {
  const parsed = registerDeviceBodySchema.safeParse({
    targetType: 'TOKEN',
    targetValue: 'abc123',
    deviceType: 'WEB',
    userId: 999,
    enterpriseId: 1
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.userId, undefined);
  assert.equal(parsed.data.enterpriseId, undefined);
});

test('deactivateDeviceBodySchema requires targetType TOKEN', () => {
  const parsed = deactivateDeviceBodySchema.safeParse({
    targetType: 'FID',
    targetValue: 'abc123'
  });

  assert.equal(parsed.success, false);
});

test('isPermanentFirebaseTokenFailure detects invalid registration token codes', () => {
  assert.equal(
    isPermanentFirebaseTokenFailure('messaging/invalid-registration-token'),
    true
  );
  assert.equal(
    isPermanentFirebaseTokenFailure('messaging/registration-token-not-registered'),
    true
  );
  assert.equal(isPermanentFirebaseTokenFailure('messaging/internal-error'), false);
});
