import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPaginationMeta,
  mapNotificationRow,
  parseOracleJson
} from '../utils/notification.mapper.js';
import {
  createNotificationBodySchema,
  listNotificationsQuerySchema
} from '../validation/notification.validator.js';

test('parseOracleJson returns null for empty values', () => {
  assert.equal(parseOracleJson(null), null);
  assert.equal(parseOracleJson(''), null);
});

test('parseOracleJson parses JSON strings', () => {
  assert.deepEqual(parseOracleJson('{"employeeName":"John"}'), { employeeName: 'John' });
});

test('mapNotificationRow maps camelCase Flutter payload', () => {
  const mapped = mapNotificationRow({
    RECIPIENT_ID: 1,
    RECIPIENT_GUID: 'ABC123',
    NOTIFICATION_ID: 10,
    NOTIFICATION_GUID: 'DEF456',
    MODULE_CODE: 'ABSENCE',
    NOTIFICATION_TYPE: 'APPROVAL_REQUIRED',
    TITLE: 'Leave Approval Required',
    MESSAGE: 'John submitted leave.',
    PRIORITY: 'NORMAL',
    ENTITY_TYPE: 'ABSENCE_REQUEST',
    ENTITY_ID: 1045,
    ENTITY_GUID: 'XYZ789',
    ENTITY_DATA_JSON: '{"employeeName":"John Smith"}',
    ACTION_URL: '/absence/approvals/XYZ789',
    ICON_CODE: 'calendar',
    METADATA_JSON: '{"category":"APPROVAL"}',
    READ_FLAG: 'N',
    DISMISSED_FLAG: 'N',
    CREATION_DATE: new Date('2026-08-19T10:00:00.000Z')
  });

  assert.equal(mapped.module, 'ABSENCE');
  assert.equal(mapped.read, false);
  assert.equal(mapped.entity.data.employeeName, 'John Smith');
  assert.equal(mapped.metadata.category, 'APPROVAL');
  assert.equal(mapped.creationDate, '2026-08-19T10:00:00.000Z');
});

test('buildPaginationMeta calculates total pages', () => {
  assert.deepEqual(
    buildPaginationMeta({ page: 1, limit: 20, total: 100 }),
    { page: 1, limit: 20, total: 100, totalPages: 5 }
  );
});

test('listNotificationsQuerySchema defaults status/page/limit', () => {
  const parsed = listNotificationsQuerySchema.safeParse({});
  assert.equal(parsed.success, true);
  assert.equal(parsed.data.status, 'ALL');
  assert.equal(parsed.data.page, 1);
  assert.equal(parsed.data.limit, 20);
});

test('createNotificationBodySchema rejects external actionUrl', () => {
  const parsed = createNotificationBodySchema.safeParse({
    recipientUserId: 1,
    module: 'ABSENCE',
    type: 'TEST',
    title: 'Title',
    message: 'Message',
    actionUrl: 'https://evil.example.com/path'
  });

  assert.equal(parsed.success, false);
});

test('createNotificationBodySchema accepts internal actionUrl', () => {
  const parsed = createNotificationBodySchema.safeParse({
    recipientUserId: 1,
    module: 'ABSENCE',
    type: 'TEST',
    title: 'Title',
    message: 'Message',
    actionUrl: '/absence/approvals/ABC123'
  });

  assert.equal(parsed.success, true);
});
