import test from 'node:test';
import assert from 'node:assert/strict';
import EnterpriseModel from '../model/enterpriseModel.js';
import {
  ENTERPRISE_CURRENCY_CODE_ERROR,
  ENTERPRISE_CURRENCY_REQUIRED_ERROR,
  applyEnterpriseCurrencyCode,
  parseEnterpriseCurrencyCode,
  parseEnterpriseCurrencyFilter
} from '../utils/enterpriseCurrency.js';

test('parseEnterpriseCurrencyCode trims and uppercases ISO-style codes', () => {
  assert.deepEqual(parseEnterpriseCurrencyCode('kwd'), { ok: true, value: 'KWD' });
  assert.deepEqual(parseEnterpriseCurrencyCode(' Usd '), { ok: true, value: 'USD' });
  assert.deepEqual(parseEnterpriseCurrencyCode('SAR'), { ok: true, value: 'SAR' });
});

test('parseEnterpriseCurrencyCode omits null, undefined, and blank values', () => {
  assert.deepEqual(parseEnterpriseCurrencyCode(undefined), { ok: true, value: undefined });
  assert.deepEqual(parseEnterpriseCurrencyCode(null), { ok: true, value: undefined });
  assert.deepEqual(parseEnterpriseCurrencyCode(''), { ok: true, value: undefined });
  assert.deepEqual(parseEnterpriseCurrencyCode('   '), { ok: true, value: undefined });
});

test('parseEnterpriseCurrencyCode rejects non-ISO values', () => {
  for (const value of ['KD', 'KWD1', '123', 'kw', 'KUWAIT', 123, true, { code: 'KWD' }]) {
    const parsed = parseEnterpriseCurrencyCode(value);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, ENTERPRISE_CURRENCY_CODE_ERROR);
  }
});

test('applyEnterpriseCurrencyCode requires currency on create', () => {
  const missingErrors = [];
  applyEnterpriseCurrencyCode({}, missingErrors, { required: true });
  assert.deepEqual(missingErrors, [ENTERPRISE_CURRENCY_REQUIRED_ERROR]);

  const blankErrors = [];
  applyEnterpriseCurrencyCode({ currency_code: '   ' }, blankErrors, { required: true });
  assert.deepEqual(blankErrors, [ENTERPRISE_CURRENCY_REQUIRED_ERROR]);
});

test('applyEnterpriseCurrencyCode normalizes valid create payload', () => {
  const body = { currency_code: 'kwd' };
  const errors = [];
  applyEnterpriseCurrencyCode(body, errors, { required: true });
  assert.deepEqual(errors, []);
  assert.equal(body.CURRENCY_CODE, 'KWD');
  assert.equal('currency_code' in body, false);
});

test('applyEnterpriseCurrencyCode keeps update optional', () => {
  const body = {};
  const errors = [];
  applyEnterpriseCurrencyCode(body, errors, { required: false });
  assert.deepEqual(errors, []);
  assert.equal('currency_code' in body, false);
});

test('applyEnterpriseCurrencyCode accepts currency-only update payload', () => {
  const body = { currency_code: 'usd' };
  const errors = [];
  applyEnterpriseCurrencyCode(body, errors, { required: false });
  assert.deepEqual(errors, []);
  assert.equal(body.CURRENCY_CODE, 'USD');
});

test('parseEnterpriseCurrencyFilter normalizes list filter values', () => {
  assert.deepEqual(parseEnterpriseCurrencyFilter('kwd'), { ok: true, value: 'KWD' });
  assert.deepEqual(parseEnterpriseCurrencyFilter(undefined), { ok: true, value: undefined });
  assert.deepEqual(parseEnterpriseCurrencyFilter(''), { ok: true, value: undefined });
  assert.equal(parseEnterpriseCurrencyFilter('12').ok, false);
});

test('CREATE payload includes normalized currency_code', () => {
  const body = {
    ENTERPRISE_CODE: 'TEST_ENT',
    ENTERPRISE_NAME: 'Test Enterprise',
    currency_code: 'kwd'
  };
  const errors = [];
  applyEnterpriseCurrencyCode(body, errors, { required: true });
  assert.deepEqual(errors, []);

  const payload = EnterpriseModel.toPackagePayload(body, 'ADMIN');
  assert.equal(payload.currency_code, 'KWD');
  assert.equal(payload.enterprise_code, 'TEST_ENT');
  assert.equal(payload.enterprise_name, 'Test Enterprise');
  assert.equal(payload.actor, 'ADMIN');
});

test('UPDATE payload includes currency_code only when provided', () => {
  const currencyBody = { currency_code: 'usd' };
  applyEnterpriseCurrencyCode(currencyBody, [], { required: false });
  const currencyOnly = EnterpriseModel.toPackagePayload(currencyBody, 'ADMIN');
  const serialized = JSON.parse(JSON.stringify(currencyOnly));
  assert.equal(serialized.currency_code, 'USD');
  assert.equal('enterprise_name' in serialized, false);

  const nameOnly = EnterpriseModel.toPackagePayload(
    { ENTERPRISE_NAME: 'Updated Name' },
    'ADMIN'
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(nameOnly)), 'currency_code'),
    false
  );
});

test('LIST payload maps currency_code filter', () => {
  assert.deepEqual(
    EnterpriseModel.toListPayload({ currencyCode: 'KWD' }),
    { currency_code: 'KWD' }
  );
});
