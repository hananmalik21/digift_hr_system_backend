import test from 'node:test';
import assert from 'node:assert/strict';
import PositionsModel from '../model/positions_model.js';
import { parsePositionListFilters, resolveRequiredListTenantId } from '../validators/positionValidator.js';

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

test('list filters parse tenant_id from the query string', () => {
  const { filters, errors } = parsePositionListFilters({ tenant_id: '3' });
  assert.deepEqual(errors, []);
  assert.equal(filters.tenant_id, 3);
});

test('list filters reject a non-positive tenant_id', () => {
  const { errors } = parsePositionListFilters({ tenant_id: '0' });
  assert.equal(errors.length > 0, true);
  assert.match(errors[0], /tenant_id/);
});

test('resolveRequiredListTenantId reads tenant_id from query', () => {
  assert.equal(resolveRequiredListTenantId({ query: { tenant_id: '3' } }), 3);
});

test('resolveRequiredListTenantId uses the first tenant_id when query repeats the key', () => {
  assert.equal(resolveRequiredListTenantId({ query: { tenant_id: ['3', '1'] } }), 3);
});

test('resolveRequiredListTenantId reads tenant_id from the URL when query is empty', () => {
  assert.equal(
    resolveRequiredListTenantId({ query: {}, originalUrl: '/api/positions?tenant_id=3' }),
    3
  );
});

test('resolveRequiredListTenantId does not fall back to JWT/hostname', () => {
  assert.throws(
    () => resolveRequiredListTenantId({
      query: {},
      originalUrl: '/api/positions',
      user: { enterprise_id: 1 },
      enterprise: { enterpriseId: 1 }
    }),
    /tenant_id is required/
  );
});
