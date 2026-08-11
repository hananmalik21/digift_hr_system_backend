/**
 * Unit / scenario tests for DigifyHR payroll shared utilities.
 * No live Oracle required.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, ForbiddenError } from '../../../utils/errors/index.js';
import { mapPayrollOracleError } from '../shared/payrollOracleErrors.js';
import {
  packageSuccessIsTruthy,
  numberBind,
  stringBind,
  ynBind
} from '../shared/payrollPackageExecutor.js';
import {
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  mapGuid,
  mapPayRow
} from '../shared/payrollRowMapper.js';
import {
  requirePositiveInt,
  optionalPositiveInt,
  requireString,
  requireYn,
  optionalDate,
  parsePaginationQuery,
  assertEnterpriseAccess
} from '../shared/payrollValidation.js';
import {
  okList,
  okGet,
  okMutation,
  failOutcome,
  notFoundOutcome,
  listMeta
} from '../shared/payrollResponse.js';

function ora(num, message) {
  return { errorNum: num, message: `ORA-${num}: ${message}` };
}

test('mapPayrollOracleError maps known business messages', () => {
  const cases = [
    ['Duplicate payroll run for period', 'Duplicate payroll run.'],
    ['Employee is not eligible for element', 'Employee is not eligible.'],
    ['Payroll run is already finalized', 'Payroll run is already finalized.'],
    ['Payment batch requires approval before issue', 'Payment batch requires approval.'],
    ['Journal is not balanced', 'Journal is not balanced.'],
    ['Journal requires GL approval', 'Journal requires GL approval.'],
    ['Requester cannot approve their own request', 'Requester cannot approve their own request.'],
    ['Approval limit exceeded for actor', 'Approval limit exceeded.'],
    ['Operation cannot retry unless failed', 'Operation cannot retry unless failed.']
  ];
  for (const [dbMsg, expected] of cases) {
    const mapped = mapPayrollOracleError(ora(20001, dbMsg));
    assert.equal(mapped.message, expected, dbMsg);
    assert.equal(mapped.code, 'ORA-20001');
  }
});

test('mapPayrollOracleError falls back to cleaned ORA text', () => {
  const mapped = mapPayrollOracleError(ora(20999, 'Something unexpected happened'));
  assert.equal(mapped.message, 'Something unexpected happened');
});

test('packageSuccessIsTruthy accepts Y/TRUE/SUCCESS', () => {
  for (const v of ['Y', 'y', 'TRUE', 'true', 'SUCCESS', 'OK', '1']) {
    assert.equal(packageSuccessIsTruthy(v), true, String(v));
  }
  for (const v of ['N', 'ERROR', 'FAILED', '', null, undefined]) {
    assert.equal(packageSuccessIsTruthy(v), false, String(v));
  }
});

test('bind helpers coerce values', () => {
  assert.equal(numberBind(10).val, 10);
  assert.equal(numberBind('').val, null);
  assert.equal(stringBind('ABC', 10).val, 'ABC');
  assert.equal(ynBind(true).val, 'Y');
  assert.equal(ynBind('N').val, 'N');
  assert.equal(ynBind(null, 'Y').val, 'Y');
});

test('row mapper converts dates, numbers, guids', async () => {
  assert.equal(toIsoDateOrNull(new Date('2026-08-01T12:00:00Z')), '2026-08-01');
  assert.ok(toIsoDateTimeOrNull(new Date('2026-08-01T12:00:00Z')).startsWith('2026-08-01'));
  assert.equal(toNumberOrNull('12.5'), 12.5);
  assert.equal(toNumberOrNull(null), null);
  assert.equal(mapGuid('583A83AB-DF9A-754D-E063-1718000AF43B'), '583a83abdf9a754de0631718000af43b');

  const mapped = await mapPayRow(
    {
      RUN_ID: 163,
      RUN_GUID: '583A83ABDF9A754DE0631718000AF43B',
      PERIOD_START_DATE: new Date('2027-08-01T00:00:00Z'),
      NET_PAY: '1765',
      STATUS_CODE: 'COMPLETED',
      TOTAL_COUNT: 99
    },
    { guids: ['RUN_GUID'], dates: ['PERIOD_START_DATE'], numbers: ['RUN_ID', 'NET_PAY'] }
  );
  assert.equal(mapped.run_id, 163);
  assert.equal(mapped.run_guid, '583a83abdf9a754de0631718000af43b');
  assert.equal(mapped.net_pay, 1765);
  assert.equal(mapped.status_code, 'COMPLETED');
  assert.equal(mapped.period_start_date, '2027-08-01');
  assert.equal(mapped.total_count, undefined);
});

test('validation helpers enforce required types', () => {
  assert.equal(requirePositiveInt('5', 'page'), 5);
  assert.throws(() => requirePositiveInt(0, 'page'), ValidationError);
  assert.equal(optionalPositiveInt('', 'x'), null);
  assert.equal(requireString(' abc ', 'name'), 'abc');
  assert.throws(() => requireString('', 'name'), ValidationError);
  assert.equal(requireYn('Y', 'flag'), 'Y');
  assert.throws(() => requireYn('YES', 'flag'), ValidationError);
  assert.ok(optionalDate('2026-08-01', 'd') instanceof Date);
  assert.throws(() => optionalDate('not-a-date', 'd'), ValidationError);

  const pag = parsePaginationQuery({ page: '2', page_size: '50' });
  assert.deepEqual(pag, { page: 2, pageSize: 50, limit: 50 });
});

test('assertEnterpriseAccess blocks cross-tenant access', () => {
  const req = { user: { enterprise_id: 1 }, enterprise: { enterpriseId: 1 } };
  assert.doesNotThrow(() => assertEnterpriseAccess(req, 1));
  assert.throws(() => assertEnterpriseAccess(req, 99), ForbiddenError);
});

test('response helpers match DigifyHR pay list/get envelopes', () => {
  const list = okList('Records retrieved successfully.', [{ id: 1 }], 1, 25, 100);
  assert.equal(list.success, true);
  assert.deepEqual(list.meta.pagination, {
    page: 1,
    pageSize: 25,
    total: 100,
    totalPages: 4,
    hasNext: true,
    hasPrevious: false
  });
  assert.deepEqual(listMeta(1, 10, 0).pagination.totalPages, 0);

  const get = okGet('Fetched', { run_id: 1 });
  assert.equal(get.data.run_id, 1);

  const mut = okMutation('Created', { id: 1 }, 201);
  assert.equal(mut.httpStatus, 201);

  const fail = failOutcome('bad', 400);
  assert.equal(fail.success, false);
  assert.equal(notFoundOutcome().httpStatus, 404);
});
