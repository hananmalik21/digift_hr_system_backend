import test from 'node:test';
import assert from 'node:assert/strict';
import GradeModel from '../model/grades_model.js';
import {
  DEFAULT_GRADE_CURRENCY,
  GRADE_CURRENCY_CODE_ERROR,
  applyGradeCurrencyCode,
  parseGradeCurrencyCode,
  resolveGradeCurrencyCode
} from '../utils/gradeCurrency.js';

test('parseGradeCurrencyCode trims and uppercases ISO-style codes', () => {
  assert.deepEqual(parseGradeCurrencyCode('kwd'), { ok: true, value: 'KWD' });
  assert.deepEqual(parseGradeCurrencyCode(' Usd '), { ok: true, value: 'USD' });
  assert.deepEqual(parseGradeCurrencyCode('SAR'), { ok: true, value: 'SAR' });
});

test('parseGradeCurrencyCode omits null, undefined, and blank values', () => {
  assert.deepEqual(parseGradeCurrencyCode(undefined), { ok: true, value: undefined });
  assert.deepEqual(parseGradeCurrencyCode(null), { ok: true, value: undefined });
  assert.deepEqual(parseGradeCurrencyCode(''), { ok: true, value: undefined });
  assert.deepEqual(parseGradeCurrencyCode('   '), { ok: true, value: undefined });
});

test('parseGradeCurrencyCode rejects non-ISO values', () => {
  for (const value of ['KW', 'KWD123', '123', 'KUWAITI DINAR', 'KUWAIT', 123, true, { code: 'KWD' }]) {
    const parsed = parseGradeCurrencyCode(value);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.error, GRADE_CURRENCY_CODE_ERROR);
  }
});

test('resolveGradeCurrencyCode defaults only when the field is omitted', () => {
  assert.equal(resolveGradeCurrencyCode('usd'), 'USD');
  assert.equal(resolveGradeCurrencyCode(undefined, { defaultCurrency: DEFAULT_GRADE_CURRENCY }), 'KWD');
  assert.equal(resolveGradeCurrencyCode(undefined), undefined);
  assert.equal(resolveGradeCurrencyCode('KUWAIT', { defaultCurrency: DEFAULT_GRADE_CURRENCY }), undefined);
});

test('applyGradeCurrencyCode normalizes the request body or records an error', () => {
  const okBody = { CURRENCY_CODE: ' kwD ' };
  const okErrors = [];
  applyGradeCurrencyCode(okBody, okErrors);
  assert.equal(okBody.CURRENCY_CODE, 'KWD');
  assert.deepEqual(okErrors, []);

  const blankBody = { CURRENCY_CODE: '  ' };
  applyGradeCurrencyCode(blankBody, []);
  assert.equal('CURRENCY_CODE' in blankBody, false);

  const badErrors = [];
  applyGradeCurrencyCode({ CURRENCY_CODE: 'KUWAIT' }, badErrors);
  assert.deepEqual(badErrors, [GRADE_CURRENCY_CODE_ERROR]);
});

test('CREATE payload normalizes currency_code and defaults to KWD when omitted', () => {
  const withCode = GradeModel.toPackagePayload(
    { GRADE_NUMBER: 'G10', GRADE_CATEGORY: 'MANAGEMENT', CURRENCY_CODE: 'kwd' },
    'ADMIN',
    1,
    { defaultCurrency: DEFAULT_GRADE_CURRENCY }
  );
  assert.equal(withCode.currency_code, 'KWD');
  assert.equal(withCode.tenant_id, 1);
  assert.equal(withCode.actor, 'ADMIN');

  const withoutCode = GradeModel.toPackagePayload(
    { GRADE_NUMBER: 'G10', GRADE_CATEGORY: 'MANAGEMENT' },
    'ADMIN',
    1,
    { defaultCurrency: DEFAULT_GRADE_CURRENCY }
  );
  assert.equal(withoutCode.currency_code, DEFAULT_GRADE_CURRENCY);
});

test('UPDATE payload includes currency_code only when provided', () => {
  const currencyOnly = GradeModel.toPackagePayload(
    { CURRENCY_CODE: 'usd' },
    'ADMIN',
    1
  );
  const serialized = JSON.parse(JSON.stringify(currencyOnly));
  assert.equal(serialized.currency_code, 'USD');
  assert.equal('grade_number' in serialized, false);

  const descriptionOnly = GradeModel.toPackagePayload(
    { DESCRIPTION: 'Updated Management Grade' },
    'ADMIN',
    1
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(JSON.parse(JSON.stringify(descriptionOnly)), 'currency_code'),
    false
  );
});
