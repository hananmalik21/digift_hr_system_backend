import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJsonColumn, parseJsonColumnOrDefault } from '../recViewJsonParse.js';

test('parseJsonColumn returns empty array for null/empty when asArray', async () => {
  assert.deepEqual(await parseJsonColumn(null, true), []);
  assert.deepEqual(await parseJsonColumn('', true), []);
  assert.deepEqual(await parseJsonColumn('   ', true), []);
});

test('parseJsonColumn parses JSON strings and rejects non-arrays when asArray', async () => {
  assert.deepEqual(await parseJsonColumn('[{"a":1}]', true), [{ a: 1 }]);
  assert.deepEqual(await parseJsonColumn('{"a":1}', true), []);
  assert.deepEqual(await parseJsonColumn('{bad', true), []);
});

test('parseJsonColumn reads LOB getData before parsing', async () => {
  const lob = {
    getData: async () => '[{"id":1}]'
  };
  assert.deepEqual(await parseJsonColumn(lob, true), [{ id: 1 }]);
});

test('parseJsonColumn does not treat LOB objects as already-parsed JSON', async () => {
  const lob = {
    getData: () => Promise.resolve('{"ok":true}')
  };
  assert.deepEqual(await parseJsonColumn(lob, false), { ok: true });
});

test('parseJsonColumnOrDefault supplies empty defaults', async () => {
  assert.deepEqual(await parseJsonColumnOrDefault(null, true), []);
  assert.deepEqual(await parseJsonColumnOrDefault(null, false), {});
});
