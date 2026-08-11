/**
 * Integration-style tests for compensation transfer helpers.
 * Pure mapping / period resolution (no live Oracle).
 * Live package scenarios are covered by Postman + connected DB verification.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapAvailablePayrollDefinitionRow,
  mapTransferredEntryRow,
  resolvePayRunPeriod
} from '../model/payCompensationTransferModel.js';
import { mapCompensationTransferOracleError } from '../utils/payCompensationTransferOracleErrors.js';

test('resolvePayRunPeriod February leap year last day is 29', () => {
  assert.deepEqual(resolvePayRunPeriod({ PROCESS_MONTH_NO: 2, PROCESS_YEAR: 2024 }), {
    period_start_date: '2024-02-01',
    period_end_date: '2024-02-29'
  });
});

test('resolvePayRunPeriod non-leap February ends on 28', () => {
  assert.deepEqual(resolvePayRunPeriod({ PROCESS_MONTH_NO: 2, PROCESS_YEAR: 2025 }), {
    period_start_date: '2025-02-01',
    period_end_date: '2025-02-28'
  });
});

test('mapAvailablePayrollDefinitionRow shapes GUID and dates', () => {
  const mapped = mapAvailablePayrollDefinitionRow({
    PAYROLL_ID: 1,
    PAYROLL_GUID: 'aabbccdd',
    ENTERPRISE_ID: 1,
    PAYROLL_NAME: 'Monthly Payroll',
    PAYROLL_CODE: 'MONTHLY',
    EFFECTIVE_START_DATE: new Date('2026-01-01T00:00:00.000Z'),
    EFFECTIVE_END_DATE: null,
    STATUS: 'ACTIVE'
  });
  assert.equal(mapped.payroll_id, 1);
  assert.equal(mapped.payroll_name, 'Monthly Payroll');
  assert.equal(mapped.effective_start_date, '2026-01-01');
  assert.equal(mapped.effective_end_date, null);
});

test('mapTransferredEntryRow distinguishes payroll_id from batch_id (pay_run_id)', () => {
  const mapped = mapTransferredEntryRow({
    ELEMENT_ENTRY_ID: 48,
    ELEMENT_ENTRY_GUID: 'guid',
    ENTERPRISE_ID: 1,
    EMPLOYEE_ID: 10,
    ELEMENT_ID: 3,
    ELEMENT_CODE: 'BASIC',
    ELEMENT_NAME: 'Basic Salary',
    PAYROLL_ID: 1,
    PAYROLL_GUID: 'pd-guid',
    PAYROLL_NAME: 'Monthly Payroll',
    PAYROLL_CODE: 'MONTHLY',
    PAYROLL_STATUS: 'ACTIVE',
    COMP_PAY_RUN_ID: 68,
    SOURCE_CODE: 'COMPENSATION',
    SOURCE_REFERENCE: 'COMP_PAY_RUN_LINE:324:REGULAR',
    RETROACTIVE_FLAG: 'N',
    CURRENCY_CODE: 'USD',
    AMOUNT: 2200,
    RETRO_AMOUNT: 0,
    PAY_VALUE: 2200
  });

  assert.equal(mapped.payroll_id, 1, 'PAYROLL_ID is Payroll Definition');
  assert.equal(mapped.batch_id, 68, 'BATCH_ID is compensation pay_run_id');
  assert.equal(mapped.comp_pay_run_id, 68);
  assert.notEqual(mapped.payroll_id, mapped.batch_id);
});

test('regular + retro entries share the selected payroll_id in mapped rows', () => {
  const regular = mapTransferredEntryRow({
    ELEMENT_ENTRY_ID: 48,
    PAYROLL_ID: 1,
    COMP_PAY_RUN_ID: 68,
    RETROACTIVE_FLAG: 'N',
    AMOUNT: 2200,
    RETRO_AMOUNT: 0,
    PAY_VALUE: 2200,
    SOURCE_REFERENCE: 'COMP_PAY_RUN_LINE:324:REGULAR'
  });
  const retro = mapTransferredEntryRow({
    ELEMENT_ENTRY_ID: 49,
    PAYROLL_ID: 1,
    COMP_PAY_RUN_ID: 68,
    RETROACTIVE_FLAG: 'Y',
    AMOUNT: 0,
    RETRO_AMOUNT: 200,
    PAY_VALUE: 200,
    SOURCE_REFERENCE: 'COMP_PAY_RUN_LINE:324:RETRO'
  });
  assert.equal(regular.payroll_id, retro.payroll_id);
  assert.equal(regular.batch_id, retro.batch_id);
});

test('invalid / cross-enterprise / inactive / ineffective payroll all surface as ORA-20037', () => {
  for (const msg of [
    'does not exist',
    'belongs to another enterprise',
    'inactive',
    'not effective for the processing period'
  ]) {
    const mapped = mapCompensationTransferOracleError({
      errorNum: 20037,
      message: `ORA-20037: ${msg}`
    });
    assert.equal(mapped.httpStatus, 422);
    assert.equal(mapped.error_code, 'INVALID_PAYROLL_DEFINITION');
  }
});
