import test from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '../../../../utils/errors/index.js';
import { resolvePayRunPeriod } from '../model/payCompensationTransferModel.js';
import {
  canTransferWithoutPayrollId,
  firstValidationMessage,
  validateAvailablePayrollDefinitionsQuery,
  validateTransferLineInput,
  validateTransferPayRunInput,
  validateTransferSetupInput
} from '../validators/payCompensationTransferValidator.js';

function mockReq({ enterpriseId = 1, userId = 96, adminType = null, permissions = [] } = {}) {
  return {
    user: {
      enterprise_id: enterpriseId,
      user_id: userId,
      username: String(userId),
      admin_type: adminType,
      permissions
    }
  };
}

test('resolvePayRunPeriod uses PROCESS_MONTH_NO / PROCESS_YEAR when present', () => {
  const period = resolvePayRunPeriod({
    PROCESS_MONTH_NO: 7,
    PROCESS_YEAR: 2026,
    RUN_START_DATE: new Date('2026-07-05'),
    RUN_END_DATE: new Date('2026-07-20')
  });
  assert.deepEqual(period, {
    period_start_date: '2026-07-01',
    period_end_date: '2026-07-31'
  });
});

test('resolvePayRunPeriod falls back to RUN_START_DATE / RUN_END_DATE', () => {
  const period = resolvePayRunPeriod({
    RUN_START_DATE: '2026-06-01',
    RUN_END_DATE: '2026-06-15'
  });
  assert.deepEqual(period, {
    period_start_date: '2026-06-01',
    period_end_date: '2026-06-15'
  });
});

test('validateAvailablePayrollDefinitionsQuery accepts valid query', () => {
  const out = validateAvailablePayrollDefinitionsQuery({
    enterprise_id: 1,
    period_start_date: '2026-07-01',
    period_end_date: '2026-07-31',
    status: 'active'
  });
  assert.deepEqual(out, {
    enterprise_id: 1,
    period_start_date: '2026-07-01',
    period_end_date: '2026-07-31',
    status: 'ACTIVE'
  });
});

test('validateAvailablePayrollDefinitionsQuery rejects inverted period', () => {
  assert.throws(
    () =>
      validateAvailablePayrollDefinitionsQuery({
        enterprise_id: 1,
        period_start_date: '2026-07-31',
        period_end_date: '2026-07-01'
      }),
    (err) =>
      err instanceof ValidationError &&
      firstValidationMessage(err).includes('period_start_date must be on or before')
  );
});

test('validateTransferSetupInput requires numeric pay_run_id', () => {
  assert.throws(
    () => validateTransferSetupInput({ pay_run_id: 'abc' }, { enterprise_id: 1 }, mockReq()),
    (err) => err instanceof ValidationError
  );
});

test('validateTransferLineInput requires payroll_id for normal users', () => {
  assert.throws(
    () =>
      validateTransferLineInput(
        { pay_run_id: 68, pay_run_line_id: 324 },
        { enterprise_id: 1 },
        mockReq()
      ),
    (err) =>
      err instanceof ValidationError &&
      err.errors.includes('payroll_id is required')
  );
});

test('validateTransferLineInput rejects zero / negative / NaN IDs', () => {
  assert.throws(
    () =>
      validateTransferLineInput(
        { pay_run_id: 0, pay_run_line_id: -1 },
        { enterprise_id: 1, payroll_id: 'NaN', created_by: '96' },
        mockReq()
      ),
    (err) => err instanceof ValidationError && err.errors.length >= 1
  );
});

test('validateTransferLineInput accepts valid payload for normal users', () => {
  const out = validateTransferLineInput(
    { pay_run_id: '68', pay_run_line_id: '324' },
    { enterprise_id: 1, payroll_id: 1 },
    mockReq({ userId: 96 })
  );
  assert.equal(out.enterprise_id, 1);
  assert.equal(out.pay_run_id, 68);
  assert.equal(out.pay_run_line_id, 324);
  assert.equal(out.payroll_id, 1);
  assert.equal(out.created_by, '96');
});

test('validateTransferLineInput allows missing payroll_id for enterprise admin', () => {
  const out = validateTransferLineInput(
    { pay_run_id: 68, pay_run_line_id: 324 },
    { enterprise_id: 1 },
    mockReq({ adminType: 'enterprise_admin' })
  );
  assert.equal(out.payroll_id, null);
});

test('canTransferWithoutPayrollId honors explicit permission', () => {
  assert.equal(
    canTransferWithoutPayrollId(
      mockReq({ permissions: ['ALLOW_UNASSIGNED_PAYROLL_ELEMENT_ENTRY'] })
    ),
    true
  );
  assert.equal(canTransferWithoutPayrollId(mockReq()), false);
});

test('validateTransferPayRunInput defaults stop_on_error to N', () => {
  const out = validateTransferPayRunInput(
    { pay_run_id: 68 },
    { enterprise_id: 1, payroll_id: 1 },
    mockReq()
  );
  assert.equal(out.stop_on_error, 'N');
});

test('validateTransferPayRunInput rejects invalid stop_on_error', () => {
  assert.throws(
    () =>
      validateTransferPayRunInput(
        { pay_run_id: 68 },
        { enterprise_id: 1, payroll_id: 1, stop_on_error: 'YES' },
        mockReq()
      ),
    (err) => err instanceof ValidationError
  );
});
