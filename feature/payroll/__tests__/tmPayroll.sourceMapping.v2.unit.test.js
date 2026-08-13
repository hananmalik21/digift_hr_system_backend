/**
 * TM → Payroll source-mapping validation + V2 OVERTIME_REQUEST contract tests.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '../../../utils/errors/index.js';
import {
  OVERTIME_ORACLE_OWNED_FIELDS,
  OVERTIME_REQUEST_SOURCE_TYPE,
  TM_OWNED_OVERTIME_CONFIG_FIELDS,
  isOvertimeRequestSource,
  requireMappingWriteFields
} from '../time_management/tmPayroll.validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVICE_PATH = path.resolve(__dirname, '../time_management/tmPayroll.service.js');
const CONTROLLER_PATH = path.resolve(__dirname, '../time_management/tmPayroll.controller.js');
const serviceSource = fs.readFileSync(SERVICE_PATH, 'utf8');
const controllerSource = fs.readFileSync(CONTROLLER_PATH, 'utf8');

function assertThrowsValidation(fn, field) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof ValidationError, 'expected ValidationError');
    if (field) {
      const fields = (err.errors || []).map((d) => d.field);
      assert.ok(
        fields.includes(field) || String(err.message).includes(field),
        `expected field ${field} in validation error, got ${JSON.stringify(fields)} / ${err.message}`
      );
    }
    return true;
  });
}

test('isOvertimeRequestSource detects OVERTIME_REQUEST', () => {
  assert.equal(isOvertimeRequestSource('OVERTIME_REQUEST'), true);
  assert.equal(isOvertimeRequestSource('overtime_request'), true);
  assert.equal(isOvertimeRequestSource('ATTENDANCE'), false);
  assert.equal(isOvertimeRequestSource(null), false);
});

test('OVERTIME_REQUEST accepts simplified shared-data contract', () => {
  assert.doesNotThrow(() =>
    requireMappingWriteFields({
      sourceTypeCode: OVERTIME_REQUEST_SOURCE_TYPE,
      payrollElementId: 71,
      effectiveStartDate: new Date('2026-08-01'),
      hoursInputValueName: 'Hours',
      multiplierInputName: 'Multiplier',
      hourlyRateInputValueName: 'Hourly Rate',
      hourlyRateSourceElementId: 67
    })
  );
});

test('OVERTIME_REQUEST does not require Oracle-owned transfer config fields', () => {
  // Absence of transfer_unit_code / payroll_source_code / hourly_rate_divisor must not fail shape validation.
  assert.doesNotThrow(() =>
    requireMappingWriteFields({
      sourceTypeCode: 'OVERTIME_REQUEST',
      payrollElementId: 71,
      effectiveStartDate: '2026-08-01',
      hoursInputValueName: 'Hours',
      multiplierInputName: 'Multiplier',
      hourlyRateInputValueName: 'Hourly Rate',
      hourlyRateSourceElementId: 67,
      transferUnitCode: null,
      payrollSourceCode: null,
      calculationOwnerCode: null,
      signMultiplier: null,
      hourlyRateDivisor: null
    })
  );
});

test('OVERTIME_REQUEST requires OT input-value and rate source element fields', () => {
  const base = {
    sourceTypeCode: 'OVERTIME_REQUEST',
    payrollElementId: 71,
    effectiveStartDate: new Date('2026-08-01'),
    hoursInputValueName: 'Hours',
    multiplierInputName: 'Multiplier',
    hourlyRateInputValueName: 'Hourly Rate',
    hourlyRateSourceElementId: 67
  };

  assertThrowsValidation(
    () => requireMappingWriteFields({ ...base, hoursInputValueName: null }),
    'hours_input_value_name'
  );
  assertThrowsValidation(
    () => requireMappingWriteFields({ ...base, multiplierInputName: null }),
    'multiplier_input_value_name'
  );
  assertThrowsValidation(
    () => requireMappingWriteFields({ ...base, hourlyRateInputValueName: null }),
    'hourly_rate_input_value_name'
  );
  assertThrowsValidation(
    () => requireMappingWriteFields({ ...base, hourlyRateSourceElementId: null }),
    'hourly_rate_source_element_id'
  );
});

test('non-overtime mappings still require transfer_unit_code', () => {
  assertThrowsValidation(
    () =>
      requireMappingWriteFields({
        sourceTypeCode: 'ATTENDANCE',
        payrollElementId: 10,
        effectiveStartDate: new Date('2026-08-01'),
        transferUnitCode: null
      }),
    'transfer_unit_code'
  );

  assert.doesNotThrow(() =>
    requireMappingWriteFields({
      sourceTypeCode: 'ATTENDANCE',
      payrollElementId: 10,
      effectiveStartDate: new Date('2026-08-01'),
      transferUnitCode: 'HOURS'
    })
  );
});

test('Oracle-owned and TM-owned OT field catalogs are documented for API contract', () => {
  assert.ok(OVERTIME_ORACLE_OWNED_FIELDS.includes('hourly_rate_divisor'));
  assert.ok(OVERTIME_ORACLE_OWNED_FIELDS.includes('transfer_unit_code'));
  assert.ok(TM_OWNED_OVERTIME_CONFIG_FIELDS.includes('ot_multiplier'));
  assert.ok(TM_OWNED_OVERTIME_CONFIG_FIELDS.includes('work_pattern_id'));
});

test('service never forces hourly_rate_divisor=1', () => {
  assert.ok(
    !serviceSource.includes('hourlyRateDivisor ?? 1'),
    'must not default hourly_rate_divisor to 1'
  );
  assert.ok(
    serviceSource.includes('numberBind(payload.hourlyRateDivisor)'),
    'must bind hourly_rate_divisor as supplied/NULL'
  );
});

test('OVERTIME_REQUEST path does not inject MANUAL_ENTRY/PAYROLL when omitted', () => {
  // Conditional bind: isOvertime ? payload.x : (payload.x ?? default)
  assert.ok(serviceSource.includes('isOvertime ? payload.payrollSourceCode'));
  assert.ok(serviceSource.includes('isOvertime ? payload.calculationOwnerCode'));
  assert.ok(serviceSource.includes('isOvertime ? payload.signMultiplier'));
});

test('controller keeps Oracle-owned OT fields body-only (no inherited defaults)', () => {
  assert.ok(controllerSource.includes('pickMappingField'));
  assert.ok(controllerSource.includes('isOvertimeRequestSource'));
  assert.ok(controllerSource.includes('requireMappingWriteFields'));
});

test('TM OT shared-data fields are not mapped into source-mapping payload', () => {
  for (const field of [
    'ot_config_id',
    'ot_rate_type_id',
    'ot_multiplier',
    'max_daily_overtime_hours',
    'work_schedule_id',
    'work_pattern_id',
    'weekly_hours'
  ]) {
    assert.ok(
      !controllerSource.includes(`'${field}'`),
      `controller must not map TM-owned field ${field}`
    );
  }
});

test('create/update handlers re-read persisted Oracle mapping for response', () => {
  assert.ok(controllerSource.includes('getSourceMappingById(outcome.data.payroll_source_mapping_id)'));
  assert.ok(controllerSource.includes('getSourceMappingById(mappingId)'));
});
