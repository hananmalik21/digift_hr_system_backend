import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeNotificationEntity } from '../utils/notification.create.js';

test('serializeNotificationEntity normalizes guid and serializes data', () => {
  const serialized = serializeNotificationEntity({
    type: 'ABSENCE_REQUEST',
    id: '1045',
    guid: 'abc-def',
    data: {
      employeeName: 'John Smith',
      duration: 6
    }
  });

  assert.equal(serialized.entityGuid, 'ABCDEF');
  assert.equal(serialized.entityId, '1045');
  assert.deepEqual(JSON.parse(serialized.entityDataJson), {
    employeeName: 'John Smith',
    duration: 6
  });
});

test('serializeNotificationEntity handles empty entity', () => {
  const serialized = serializeNotificationEntity({});
  assert.equal(serialized.entityType, null);
  assert.equal(serialized.entityDataJson, null);
});
