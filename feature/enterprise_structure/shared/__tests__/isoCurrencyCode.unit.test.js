import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ISO_CURRENCY_CODE_ERROR,
  normalizeIsoCurrencyCodeFromRow,
  parseIsoCurrencyCode
} from '../isoCurrencyCode.js';

test('parseIsoCurrencyCode trims and uppercases valid codes', () => {
  assert.deepEqual(parseIsoCurrencyCode('kwd'), { ok: true, value: 'KWD' });
  assert.deepEqual(parseIsoCurrencyCode(' Usd '), { ok: true, value: 'USD' });
});

test('parseIsoCurrencyCode rejects invalid codes with configurable message', () => {
  const parsed = parseIsoCurrencyCode('12', 'custom error');
  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, 'custom error');

  const defaultParsed = parseIsoCurrencyCode('KW');
  assert.equal(defaultParsed.ok, false);
  assert.equal(defaultParsed.error, DEFAULT_ISO_CURRENCY_CODE_ERROR);
});

test('normalizeIsoCurrencyCodeFromRow reads package row keys', () => {
  assert.equal(normalizeIsoCurrencyCodeFromRow({ currency_code: 'kwd' }), 'KWD');
  assert.equal(normalizeIsoCurrencyCodeFromRow({ CURRENCY_CODE: 'usd' }), 'USD');
  assert.equal(normalizeIsoCurrencyCodeFromRow({}), null);
  assert.equal(normalizeIsoCurrencyCodeFromRow({ currency_code: '  ' }), null);
});
