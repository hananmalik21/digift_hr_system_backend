import test from 'node:test';
import assert from 'node:assert/strict';
import PositionsModel from '../model/positions_model.js';

test('LIST/GET shape exposes grade currency_code from the package row', () => {
  const shaped = PositionsModel.shape(PositionsModel.mapViewRowForShape({
    position_id: 'AABBCCDDEEFF00112233445566778899',
    tenant_id: 1,
    position_code: 'POS-001',
    status: 'ACTIVE',
    position_title_en: 'Software Engineer',
    grade_id: 10,
    grade_number: 'G10',
    currency_code: 'KWD',
    step_no: 1,
    step_nos_json: '[1]'
  }));

  assert.equal(shaped.grade_id, 10);
  assert.equal(shaped.grade_number, 'G10');
  assert.equal(shaped.currency_code, 'KWD');
  assert.deepEqual(shaped.grade, {
    grade_id: 10,
    grade_number: 'G10',
    currency_code: 'KWD'
  });
  assert.equal('currency_code_ref' in shaped, false);
});

test('shape returns null grade currency fields when the position has no grade', () => {
  const shaped = PositionsModel.shape(PositionsModel.mapViewRowForShape({
    position_id: 'AABBCCDDEEFF00112233445566778899',
    position_code: 'POS-002'
  }));

  assert.equal(shaped.grade_id, null);
  assert.equal(shaped.grade_number, null);
  assert.equal(shaped.currency_code, null);
  assert.deepEqual(shaped.grade, {
    grade_id: null,
    grade_number: null,
    currency_code: null
  });
});

test('CREATE/UPDATE package payload does not send currency_code', () => {
  const payload = PositionsModel.toPackagePayload(
    { GRADE_ID: 10, CURRENCY_CODE: 'USD', POSITION_CODE: 'POS-001' },
    'ADMIN',
    1
  );
  assert.equal(payload.grade_id, 10);
  assert.equal('currency_code' in payload, false);
});
