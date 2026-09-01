import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUtcIsoTimestamp, normalizeUtcIsoTimestampZ } from '@digifyhr/common';

test('normalizeUtcIsoTimestamp converts Z suffix to +00:00', () => {
  assert.equal(normalizeUtcIsoTimestamp('2026-06-10T10:00:00Z'), '2026-06-10T10:00:00+00:00');
});

test('normalizeUtcIsoTimestamp rejects empty and invalid values', () => {
  assert.equal(normalizeUtcIsoTimestamp(null), null);
  assert.equal(normalizeUtcIsoTimestamp('not-a-date'), null);
});

test('normalizeUtcIsoTimestampZ restores literal Z', () => {
  assert.equal(normalizeUtcIsoTimestampZ('2026-06-10T10:00:00Z'), '2026-06-10T10:00:00Z');
});
