/**
 * TM → Payroll source-mapping request validation (REST shape only).
 * Oracle remains authoritative for business rules and OVERTIME_REQUEST normalization.
 */

import { ValidationError } from '../../../utils/errors/index.js';
import { requireDate, requirePositiveInt, requireString } from '../shared/index.js';

export const OVERTIME_REQUEST_SOURCE_TYPE = 'OVERTIME_REQUEST';

/** Oracle-owned transfer config for OVERTIME_REQUEST — REST must not require these. */
export const OVERTIME_ORACLE_OWNED_FIELDS = Object.freeze([
  'payroll_source_code',
  'calculation_owner_code',
  'transfer_unit_code',
  'sign_multiplier',
  'default_currency_code',
  'hourly_rate_source_code',
  'hourly_rate_fixed_value',
  'hourly_rate_divisor',
  'hourly_rate_policy_id'
]);

/** TM shared-data fields that must not be duplicated on source-mapping requests. */
export const TM_OWNED_OVERTIME_CONFIG_FIELDS = Object.freeze([
  'ot_config_id',
  'ot_rate_type_id',
  'ot_multiplier',
  'max_daily_overtime_hours',
  'max_annual_overtime_hours',
  'work_schedule_id',
  'work_pattern_id',
  'weekly_hours'
]);

export function isOvertimeRequestSource(sourceTypeCode) {
  return String(sourceTypeCode ?? '')
    .trim()
    .toUpperCase() === OVERTIME_REQUEST_SOURCE_TYPE;
}

/**
 * Basic request-shape validation for create/update.
 * OVERTIME_REQUEST → simplified shared-data contract.
 * Other source types → existing generic contract (transfer_unit_code required).
 */
export function requireMappingWriteFields(payload) {
  requireString(payload.sourceTypeCode, 'source_type_code');
  requirePositiveInt(payload.payrollElementId, 'payroll_element_id');

  if (!payload.effectiveStartDate) {
    throw new ValidationError('effective_start_date is required', [
      { field: 'effective_start_date', message: 'effective_start_date is required' }
    ]);
  }
  // Coerce/validate when still a raw string (create path may already have Date).
  if (!(payload.effectiveStartDate instanceof Date)) {
    requireDate(payload.effectiveStartDate, 'effective_start_date');
  }

  if (isOvertimeRequestSource(payload.sourceTypeCode)) {
    requireString(payload.hoursInputValueName, 'hours_input_value_name');
    requireString(payload.multiplierInputName, 'multiplier_input_value_name');
    requireString(payload.hourlyRateInputValueName, 'hourly_rate_input_value_name');
    requirePositiveInt(payload.hourlyRateSourceElementId, 'hourly_rate_source_element_id');
    return;
  }

  requireString(payload.transferUnitCode, 'transfer_unit_code');
}
