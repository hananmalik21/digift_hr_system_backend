/**
 * TM → PAY payroll integration.
 *
 * Packages:
 *   TM.TM_PAYROLL_HOURLY_RATE_POLICY_PKG
 *   TM.TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG
 *   TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG
 *
 * Views:
 *   TM.V_TM_PAYROLL_HOURLY_RATE_POLICIES
 *   TM.V_TM_PAYROLL_SOURCE_MAPPINGS (+ join table for HOURLY_RATE_POLICY_ID)
 *   TM.V_TM_PAYROLL_HOURLY_RATE_ACTIVATION_HISTORY
 *   TM.V_TM_PAYROLL_TRANSFER_BATCHES / _LINES / _HISTORY
 */

import oracledb from 'oracledb';
import {
  dateBind,
  executePayrollPackage,
  inoutNumber,
  numberBind,
  queryPayList,
  queryPayOne,
  stringBind
} from '../shared/index.js';

const POLICY_PKG = 'TM.TM_PAYROLL_HOURLY_RATE_POLICY_PKG';
const PROD_PKG = 'TM.TM_PAYROLL_HOURLY_RATE_PRODUCTION_PKG';
const XFER_PKG = 'TM.TM_PAYROLL_TRANSFER_PROCESSING_PKG';

const V_POLICIES = 'TM.V_TM_PAYROLL_HOURLY_RATE_POLICIES';
const V_MAPPINGS = 'TM.V_TM_PAYROLL_SOURCE_MAPPINGS';
const T_MAPPINGS = 'TM.TM_PAYROLL_SOURCE_MAPPINGS';
const V_ACTIVATION = 'TM.V_TM_PAYROLL_HOURLY_RATE_ACTIVATION_HISTORY';
const V_BATCHES = 'TM.V_TM_PAYROLL_TRANSFER_BATCHES';
const V_LINES = 'TM.V_TM_PAYROLL_TRANSFER_LINES';
const V_HISTORY = 'TM.V_TM_PAYROLL_TRANSFER_HISTORY';

// =====================================================================================
// Hourly rate policies — reads
// =====================================================================================

export async function listHourlyRatePolicies(filters) {
  return queryPayList({
    fromSql: `${V_POLICIES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      {
        sql: 'v.SOURCE_PAYROLL_ELEMENT_ID = :source_element_id',
        bind: 'source_element_id',
        value: filters.sourceElementId
      }
    ],
    search: {
      columns: ['v.POLICY_CODE', 'v.POLICY_NAME', 'v.SOURCE_PAYROLL_ELEMENT_CODE'],
      value: filters.search
    },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: {
      code: 'v.POLICY_CODE',
      name: 'v.POLICY_NAME',
      status: 'v.STATUS_CODE',
      created: 'v.CREATION_DATE'
    },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmHourlyRatePolicies'
  });
}

export async function getHourlyRatePolicyById(policyId, enterpriseId = null) {
  return queryPayOne({
    fromSql: `${V_POLICIES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.HOURLY_RATE_POLICY_ID = :policy_id', bind: 'policy_id', value: policyId },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: 'tmHourlyRatePolicies'
  });
}

/**
 * CREATE_OR_UPSERT_HOURLY_RATE_POLICY — no P_SUCCESS OUT; success = no exception + returned id.
 */
export async function upsertHourlyRatePolicy(payload) {
  const plsql = `
BEGIN
  ${POLICY_PKG}.CREATE_OR_UPSERT_HOURLY_RATE_POLICY(
    P_HOURLY_RATE_POLICY_ID     => :p_hourly_rate_policy_id,
    P_ENTERPRISE_ID             => :p_enterprise_id,
    P_PAYROLL_ID                => :p_payroll_id,
    P_POLICY_CODE               => :p_policy_code,
    P_POLICY_NAME               => :p_policy_name,
    P_SOURCE_PAYROLL_ELEMENT_ID => :p_source_payroll_element_id,
    P_SOURCE_VALUE_CODE         => :p_source_value_code,
    P_DIVISOR_METHOD_CODE       => :p_divisor_method_code,
    P_FIXED_DIVISOR             => :p_fixed_divisor,
    P_STANDARD_HOURS_PER_WEEK   => :p_standard_hours_per_week,
    P_WEEKS_PER_YEAR            => :p_weeks_per_year,
    P_MONTHS_PER_YEAR           => :p_months_per_year,
    P_ROUNDING_SCALE            => :p_rounding_scale,
    P_EFFECTIVE_START_DATE      => :p_effective_start_date,
    P_EFFECTIVE_END_DATE        => :p_effective_end_date,
    P_STATUS_CODE               => :p_status_code,
    P_DESCRIPTION               => :p_description,
    P_ACTOR                     => :p_actor
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_hourly_rate_policy_id: inoutNumber(payload.hourlyRatePolicyId),
      p_enterprise_id: numberBind(payload.enterpriseId),
      p_payroll_id: numberBind(payload.payrollId),
      p_policy_code: stringBind(payload.policyCode, 80),
      p_policy_name: stringBind(payload.policyName, 240),
      p_source_payroll_element_id: numberBind(payload.sourcePayrollElementId),
      p_source_value_code: stringBind(payload.sourceValueCode ?? 'PAY_VALUE', 80),
      p_divisor_method_code: stringBind(payload.divisorMethodCode, 80),
      p_fixed_divisor: numberBind(payload.fixedDivisor),
      p_standard_hours_per_week: numberBind(payload.standardHoursPerWeek),
      p_weeks_per_year: numberBind(payload.weeksPerYear ?? 52),
      p_months_per_year: numberBind(payload.monthsPerYear ?? 12),
      p_rounding_scale: numberBind(payload.roundingScale ?? 6),
      p_effective_start_date: dateBind(payload.effectiveStartDate),
      p_effective_end_date: dateBind(payload.effectiveEndDate),
      p_status_code: stringBind(payload.statusCode ?? 'DRAFT', 40),
      p_description: stringBind(payload.description, 4000),
      p_actor: stringBind(payload.actor, 100)
    },
    {
      genericError: 'Unable to save hourly rate policy. Please try again.',
      mapOut: (out, helpers) => ({
        hourly_rate_policy_id: helpers.num('p_hourly_rate_policy_id')
      })
    }
  );
}

export async function validateHourlyRatePolicy(policyId, effectiveDate) {
  const plsql = `
BEGIN
  ${POLICY_PKG}.VALIDATE_HOURLY_RATE_POLICY(
    P_HOURLY_RATE_POLICY_ID => :p_hourly_rate_policy_id,
    P_EFFECTIVE_DATE        => :p_effective_date,
    P_SUCCESS               => :p_success,
    P_MESSAGE               => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_hourly_rate_policy_id: numberBind(policyId),
      p_effective_date: dateBind(effectiveDate),
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to validate hourly rate policy. Please try again.',
      mapOut: () => ({ hourly_rate_policy_id: policyId })
    }
  );
}

/** PREVIEW_EMPLOYEE_HOURLY_RATE — database-driven rate resolution (preferred over FUNCTION). */
export async function previewEmployeeHourlyRate(policyId, employeeId, effectiveDate) {
  const plsql = `
BEGIN
  ${POLICY_PKG}.PREVIEW_EMPLOYEE_HOURLY_RATE(
    P_HOURLY_RATE_POLICY_ID   => :p_hourly_rate_policy_id,
    P_EMPLOYEE_ID             => :p_employee_id,
    P_EFFECTIVE_DATE          => :p_effective_date,
    P_SOURCE_ELEMENT_ENTRY_ID => :p_source_element_entry_id,
    P_SOURCE_BASE_VALUE       => :p_source_base_value,
    P_RESOLVED_DIVISOR        => :p_resolved_divisor,
    P_RESOLVED_HOURLY_RATE    => :p_resolved_hourly_rate,
    P_SOURCE_REFERENCE        => :p_source_reference,
    P_SUCCESS                 => :p_success,
    P_MESSAGE                 => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_hourly_rate_policy_id: numberBind(policyId),
      p_employee_id: numberBind(employeeId),
      p_effective_date: dateBind(effectiveDate),
      p_source_element_entry_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_source_base_value: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_resolved_divisor: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_resolved_hourly_rate: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_source_reference: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to resolve employee hourly rate. Please try again.',
      autoCommit: false,
      mapOut: (out, helpers) => ({
        hourly_rate_policy_id: policyId,
        employee_id: employeeId,
        source_element_entry_id: helpers.num('p_source_element_entry_id'),
        source_base_value: helpers.num('p_source_base_value'),
        resolved_divisor: helpers.num('p_resolved_divisor'),
        resolved_hourly_rate: helpers.num('p_resolved_hourly_rate'),
        source_reference: helpers.str('p_source_reference')
      })
    }
  );
}

export async function applyPolicyToSourceMapping(policyId, mappingId, actor) {
  const plsql = `
BEGIN
  ${POLICY_PKG}.APPLY_POLICY_TO_SOURCE_MAPPING(
    P_HOURLY_RATE_POLICY_ID     => :p_hourly_rate_policy_id,
    P_PAYROLL_SOURCE_MAPPING_ID => :p_payroll_source_mapping_id,
    P_ACTOR                     => :p_actor,
    P_SUCCESS                   => :p_success,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_hourly_rate_policy_id: numberBind(policyId),
      p_payroll_source_mapping_id: numberBind(mappingId),
      p_actor: stringBind(actor, 100),
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to apply hourly rate policy to source mapping. Please try again.',
      mapOut: () => ({
        hourly_rate_policy_id: policyId,
        payroll_source_mapping_id: mappingId
      })
    }
  );
}

// =====================================================================================
// Source mappings — reads / writes
// =====================================================================================

const MAPPING_FROM = `${V_MAPPINGS} v LEFT JOIN ${T_MAPPINGS} m ON m.PAYROLL_SOURCE_MAPPING_ID = v.PAYROLL_SOURCE_MAPPING_ID`;
const MAPPING_SELECT = 'v.*, m.HOURLY_RATE_POLICY_ID';

export async function listSourceMappings(filters) {
  return queryPayList({
    fromSql: MAPPING_FROM,
    selectSql: MAPPING_SELECT,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.SOURCE_TYPE_CODE = :source_type_code', bind: 'source_type_code', value: filters.sourceTypeCode },
      { sql: 'v.PAYROLL_ELEMENT_ID = :element_id', bind: 'element_id', value: filters.elementId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      {
        sql: 'm.HOURLY_RATE_POLICY_ID = :hourly_rate_policy_id',
        bind: 'hourly_rate_policy_id',
        value: filters.hourlyRatePolicyId
      }
    ],
    search: {
      columns: ['v.SOURCE_TYPE_CODE', 'v.ELEMENT_CODE', 'v.ELEMENT_NAME', 'v.PAYROLL_SOURCE_CODE'],
      value: filters.search
    },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: {
      status: 'v.STATUS_CODE',
      type: 'v.SOURCE_TYPE_CODE',
      created: 'v.CREATION_DATE'
    },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmSourceMappings'
  });
}

export async function getSourceMappingById(mappingId, enterpriseId = null) {
  return queryPayOne({
    fromSql: MAPPING_FROM,
    selectSql: MAPPING_SELECT,
    alias: 'v',
    filters: [
      {
        sql: 'v.PAYROLL_SOURCE_MAPPING_ID = :mapping_id',
        bind: 'mapping_id',
        value: mappingId
      },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: 'tmSourceMappings'
  });
}

export async function upsertSourceMapping(payload) {
  const plsql = `
BEGIN
  ${XFER_PKG}.CREATE_OR_UPSERT_SOURCE_MAPPING(
    P_PAYROLL_SOURCE_MAPPING_ID      => :p_payroll_source_mapping_id,
    P_ENTERPRISE_ID                  => :p_enterprise_id,
    P_SOURCE_TYPE_CODE               => :p_source_type_code,
    P_SOURCE_SUBTYPE_CODE            => :p_source_subtype_code,
    P_PAYROLL_ID                     => :p_payroll_id,
    P_PAYROLL_ELEMENT_ID             => :p_payroll_element_id,
    P_PAYROLL_SOURCE_CODE            => :p_payroll_source_code,
    P_CALCULATION_OWNER_CODE         => :p_calculation_owner_code,
    P_TRANSFER_UNIT_CODE             => :p_transfer_unit_code,
    P_HOURS_INPUT_VALUE_NAME         => :p_hours_input_value_name,
    P_DAYS_INPUT_VALUE_NAME          => :p_days_input_value_name,
    P_MULTIPLIER_INPUT_NAME          => :p_multiplier_input_name,
    P_RATE_TYPE_INPUT_NAME           => :p_rate_type_input_name,
    P_SOURCE_DATE_INPUT_NAME         => :p_source_date_input_name,
    P_SIGN_MULTIPLIER                => :p_sign_multiplier,
    P_DEFAULT_CURRENCY_CODE          => :p_default_currency_code,
    P_EFFECTIVE_START_DATE           => :p_effective_start_date,
    P_EFFECTIVE_END_DATE             => :p_effective_end_date,
    P_STATUS_CODE                    => :p_status_code,
    P_DESCRIPTION                    => :p_description,
    P_ACTOR                          => :p_actor,
    P_HOURLY_RATE_INPUT_VALUE_NAME   => :p_hourly_rate_input_value_name,
    P_HOURLY_RATE_SOURCE_CODE        => :p_hourly_rate_source_code,
    P_HOURLY_RATE_FIXED_VALUE        => :p_hourly_rate_fixed_value,
    P_HOURLY_RATE_SOURCE_ELEMENT_ID  => :p_hourly_rate_source_element_id,
    P_HOURLY_RATE_SOURCE_VALUE_CODE  => :p_hourly_rate_source_value_code,
    P_HOURLY_RATE_DIVISOR            => :p_hourly_rate_divisor
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_source_mapping_id: inoutNumber(payload.payrollSourceMappingId),
      p_enterprise_id: numberBind(payload.enterpriseId),
      p_source_type_code: stringBind(payload.sourceTypeCode, 80),
      p_source_subtype_code: stringBind(payload.sourceSubtypeCode ?? '*', 80),
      p_payroll_id: numberBind(payload.payrollId),
      p_payroll_element_id: numberBind(payload.payrollElementId),
      p_payroll_source_code: stringBind(payload.payrollSourceCode ?? 'MANUAL_ENTRY', 80),
      p_calculation_owner_code: stringBind(payload.calculationOwnerCode ?? 'PAYROLL', 80),
      p_transfer_unit_code: stringBind(payload.transferUnitCode, 40),
      p_hours_input_value_name: stringBind(payload.hoursInputValueName, 80),
      p_days_input_value_name: stringBind(payload.daysInputValueName, 80),
      p_multiplier_input_name: stringBind(payload.multiplierInputName, 80),
      p_rate_type_input_name: stringBind(payload.rateTypeInputName, 80),
      p_source_date_input_name: stringBind(payload.sourceDateInputName, 80),
      p_sign_multiplier: numberBind(payload.signMultiplier ?? 1),
      p_default_currency_code: stringBind(payload.defaultCurrencyCode, 30),
      p_effective_start_date: dateBind(payload.effectiveStartDate),
      p_effective_end_date: dateBind(payload.effectiveEndDate),
      p_status_code: stringBind(payload.statusCode ?? 'ACTIVE', 40),
      p_description: stringBind(payload.description, 4000),
      p_actor: stringBind(payload.actor, 100),
      p_hourly_rate_input_value_name: stringBind(payload.hourlyRateInputValueName, 80),
      p_hourly_rate_source_code: stringBind(payload.hourlyRateSourceCode, 80),
      p_hourly_rate_fixed_value: numberBind(payload.hourlyRateFixedValue),
      p_hourly_rate_source_element_id: numberBind(payload.hourlyRateSourceElementId),
      p_hourly_rate_source_value_code: stringBind(payload.hourlyRateSourceValueCode ?? 'PAY_VALUE', 80),
      p_hourly_rate_divisor: numberBind(payload.hourlyRateDivisor ?? 1)
    },
    {
      genericError: 'Unable to save payroll source mapping. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_source_mapping_id: helpers.num('p_payroll_source_mapping_id')
      })
    }
  );
}

// =====================================================================================
// Production hourly rate
// =====================================================================================

export async function validateProductionReadiness(payload) {
  const plsql = `
BEGIN
  ${PROD_PKG}.VALIDATE_PRODUCTION_READINESS(
    P_PAYROLL_SOURCE_MAPPING_ID      => :p_payroll_source_mapping_id,
    P_HOURLY_RATE_POLICY_ID          => :p_hourly_rate_policy_id,
    P_REFERENCE_EMPLOYEE_ID          => :p_reference_employee_id,
    P_EFFECTIVE_DATE                 => :p_effective_date,
    P_ACTOR                          => :p_actor,
    P_RESOLVED_HOURLY_RATE_POLICY_ID => :p_resolved_hourly_rate_policy_id,
    P_SOURCE_ELEMENT_ENTRY_ID        => :p_source_element_entry_id,
    P_SOURCE_BASE_VALUE              => :p_source_base_value,
    P_RESOLVED_DIVISOR               => :p_resolved_divisor,
    P_RESOLVED_HOURLY_RATE           => :p_resolved_hourly_rate,
    P_SOURCE_REFERENCE               => :p_source_reference,
    P_FIXED_TRANSFER_LINE_COUNT      => :p_fixed_transfer_line_count,
    P_READY_FLAG                     => :p_ready_flag,
    P_MESSAGE                        => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_source_mapping_id: numberBind(payload.payrollSourceMappingId),
      p_hourly_rate_policy_id: numberBind(payload.hourlyRatePolicyId),
      p_reference_employee_id: numberBind(payload.referenceEmployeeId),
      p_effective_date: dateBind(payload.effectiveDate),
      p_actor: stringBind(payload.actor, 100),
      p_resolved_hourly_rate_policy_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_source_element_entry_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_source_base_value: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_resolved_divisor: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_resolved_hourly_rate: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_source_reference: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      p_fixed_transfer_line_count: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_ready_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 10 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to validate production hourly-rate readiness. Please try again.',
      autoCommit: false,
      // No P_SUCCESS — treat package completion as success; ready_flag is business evidence.
      successKeys: [],
      mapOut: (out, helpers) => ({
        payroll_source_mapping_id: payload.payrollSourceMappingId,
        ready_flag: helpers.str('p_ready_flag'),
        hourly_rate_policy_id: helpers.num('p_resolved_hourly_rate_policy_id'),
        source_element_entry_id: helpers.num('p_source_element_entry_id'),
        source_base_value: helpers.num('p_source_base_value'),
        resolved_divisor: helpers.num('p_resolved_divisor'),
        resolved_hourly_rate: helpers.num('p_resolved_hourly_rate'),
        source_reference: helpers.str('p_source_reference'),
        fixed_transfer_line_count: helpers.num('p_fixed_transfer_line_count')
      })
    }
  );
}

export async function activateProductionHourlyRate(payload) {
  const plsql = `
BEGIN
  ${PROD_PKG}.ACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING(
    P_PAYROLL_SOURCE_MAPPING_ID => :p_payroll_source_mapping_id,
    P_HOURLY_RATE_POLICY_ID     => :p_hourly_rate_policy_id,
    P_REFERENCE_EMPLOYEE_ID     => :p_reference_employee_id,
    P_EFFECTIVE_DATE            => :p_effective_date,
    P_ACTOR                     => :p_actor,
    P_RESOLVED_HOURLY_RATE      => :p_resolved_hourly_rate,
    P_SUCCESS                   => :p_success,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_source_mapping_id: numberBind(payload.payrollSourceMappingId),
      p_hourly_rate_policy_id: numberBind(payload.hourlyRatePolicyId),
      p_reference_employee_id: numberBind(payload.referenceEmployeeId),
      p_effective_date: dateBind(payload.effectiveDate),
      p_actor: stringBind(payload.actor, 100),
      p_resolved_hourly_rate: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to activate production hourly-rate mapping. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_source_mapping_id: payload.payrollSourceMappingId,
        hourly_rate_policy_id: payload.hourlyRatePolicyId ?? null,
        resolved_hourly_rate: helpers.num('p_resolved_hourly_rate')
      })
    }
  );
}

export async function deactivateProductionHourlyRate(mappingId, reason, actor) {
  const plsql = `
BEGIN
  ${PROD_PKG}.DEACTIVATE_PRODUCTION_HOURLY_RATE_MAPPING(
    P_PAYROLL_SOURCE_MAPPING_ID => :p_payroll_source_mapping_id,
    P_REASON                    => :p_reason,
    P_ACTOR                     => :p_actor,
    P_SUCCESS                   => :p_success,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_source_mapping_id: numberBind(mappingId),
      p_reason: stringBind(reason, 4000),
      p_actor: stringBind(actor, 100),
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to deactivate production hourly-rate mapping. Please try again.',
      mapOut: () => ({ payroll_source_mapping_id: mappingId })
    }
  );
}

export async function listHourlyRateActivationHistory(filters) {
  return queryPayList({
    fromSql: `${V_ACTIVATION} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      {
        sql: 'v.PAYROLL_SOURCE_MAPPING_ID = :mapping_id',
        bind: 'mapping_id',
        value: filters.payrollSourceMappingId
      },
      {
        sql: 'v.HOURLY_RATE_POLICY_ID = :policy_id',
        bind: 'policy_id',
        value: filters.hourlyRatePolicyId
      },
      { sql: 'v.ACTION_CODE = :action_code', bind: 'action_code', value: filters.actionCode }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmHourlyRateActivationHistory'
  });
}

// =====================================================================================
// Transfer batches / lines
// =====================================================================================

export async function listTransferBatches(filters) {
  return queryPayList({
    fromSql: `${V_BATCHES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.PAYROLL_RUN_ID = :run_id', bind: 'run_id', value: filters.runId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      {
        sql: 'v.RECONCILIATION_STATUS_CODE = :recon_status',
        bind: 'recon_status',
        value: filters.reconciliationStatusCode
      },
      {
        sql: 'v.PERIOD_START_DATE >= :date_from',
        bind: 'date_from',
        value: filters.dateFrom
      },
      {
        sql: 'v.PERIOD_END_DATE <= :date_to',
        bind: 'date_to',
        value: filters.dateTo
      }
    ],
    search: {
      columns: ['v.TRANSFER_BATCH_NUMBER', 'v.PAYROLL_CODE', 'v.PAYROLL_NAME'],
      value: filters.search
    },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: {
      status: 'v.STATUS_CODE',
      created: 'v.CREATION_DATE',
      period: 'v.PERIOD_START_DATE'
    },
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmTransferBatches'
  });
}

export async function getTransferBatchById(batchId, enterpriseId = null) {
  return queryPayOne({
    fromSql: `${V_BATCHES} v`,
    alias: 'v',
    filters: [
      {
        sql: 'v.PAYROLL_TRANSFER_BATCH_ID = :batch_id',
        bind: 'batch_id',
        value: batchId
      },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: 'tmTransferBatches'
  });
}

export async function listTransferLines(filters) {
  return queryPayList({
    fromSql: `${V_LINES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      {
        sql: 'v.PAYROLL_TRANSFER_BATCH_ID = :batch_id',
        bind: 'batch_id',
        value: filters.payrollTransferBatchId
      },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode },
      {
        sql: 'v.PAYROLL_SOURCE_MAPPING_ID = :mapping_id',
        bind: 'mapping_id',
        value: filters.payrollSourceMappingId
      }
    ],
    search: {
      columns: ['v.ELEMENT_CODE', 'v.ELEMENT_NAME', 'v.TRANSFER_KEY', 'v.SOURCE_TYPE_CODE'],
      value: filters.search
    },
    defaultSort: 'v.PAYROLL_TRANSFER_LINE_ID ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmTransferLines'
  });
}

export async function getTransferLineById(lineId, enterpriseId = null) {
  return queryPayOne({
    fromSql: `${V_LINES} v`,
    alias: 'v',
    filters: [
      {
        sql: 'v.PAYROLL_TRANSFER_LINE_ID = :line_id',
        bind: 'line_id',
        value: lineId
      },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: 'tmTransferLines'
  });
}

export async function listTransferHistory(filters) {
  return queryPayList({
    fromSql: `${V_HISTORY} v`,
    alias: 'v',
    filters: [
      {
        sql: 'v.PAYROLL_TRANSFER_BATCH_ID = :batch_id',
        bind: 'batch_id',
        value: filters.payrollTransferBatchId
      },
      {
        sql: 'v.PAYROLL_TRANSFER_LINE_ID = :line_id',
        bind: 'line_id',
        value: filters.payrollTransferLineId
      },
      { sql: 'v.ACTION_CODE = :action_code', bind: 'action_code', value: filters.actionCode }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmTransferHistory'
  });
}

export async function createTransferBatch(payload) {
  const plsql = `
BEGIN
  ${XFER_PKG}.CREATE_TRANSFER_BATCH(
    P_ENTERPRISE_ID             => :p_enterprise_id,
    P_PAYROLL_ID                => :p_payroll_id,
    P_PERIOD_START_DATE         => :p_period_start_date,
    P_PERIOD_END_DATE           => :p_period_end_date,
    P_TRANSFER_BATCH_NUMBER     => :p_transfer_batch_number,
    P_ACTOR                     => :p_actor,
    P_PAYROLL_TRANSFER_BATCH_ID => :p_payroll_transfer_batch_id
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(payload.enterpriseId),
      p_payroll_id: numberBind(payload.payrollId),
      p_period_start_date: dateBind(payload.periodStartDate),
      p_period_end_date: dateBind(payload.periodEndDate),
      p_transfer_batch_number: stringBind(payload.transferBatchNumber, 80),
      p_actor: stringBind(payload.actor, 100),
      p_payroll_transfer_batch_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER }
    },
    {
      genericError: 'Unable to create transfer batch. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: helpers.num('p_payroll_transfer_batch_id')
      })
    }
  );
}

export async function previewTransferBatch(batchId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.PREVIEW_TRANSFER_BATCH(
    P_PAYROLL_TRANSFER_BATCH_ID => :p_payroll_transfer_batch_id,
    P_ACTOR                     => :p_actor,
    P_TOTAL_SOURCE_RECORDS      => :p_total_source_records,
    P_TOTAL_TRANSFER_LINES      => :p_total_transfer_lines,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_actor: stringBind(actor, 100),
      p_total_source_records: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_total_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to preview transfer batch. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: batchId,
        total_source_records: helpers.num('p_total_source_records'),
        total_transfer_lines: helpers.num('p_total_transfer_lines')
      })
    }
  );
}

export async function validateTransferBatch(batchId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.VALIDATE_TRANSFER_BATCH(
    P_PAYROLL_TRANSFER_BATCH_ID => :p_payroll_transfer_batch_id,
    P_ACTOR                     => :p_actor,
    P_VALIDATED_TRANSFER_LINES  => :p_validated_transfer_lines,
    P_ERROR_TRANSFER_LINES      => :p_error_transfer_lines,
    P_SUCCESS                   => :p_success,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_actor: stringBind(actor, 100),
      p_validated_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_error_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to validate transfer batch. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: batchId,
        validated_transfer_lines: helpers.num('p_validated_transfer_lines'),
        error_transfer_lines: helpers.num('p_error_transfer_lines')
      })
    }
  );
}

export async function transferBatchToPayroll(batchId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.TRANSFER_BATCH_TO_PAYROLL(
    P_PAYROLL_TRANSFER_BATCH_ID  => :p_payroll_transfer_batch_id,
    P_ACTOR                      => :p_actor,
    P_TRANSFERRED_TRANSFER_LINES => :p_transferred_transfer_lines,
    P_ERROR_TRANSFER_LINES       => :p_error_transfer_lines,
    P_SUCCESS                    => :p_success,
    P_MESSAGE                    => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_actor: stringBind(actor, 100),
      p_transferred_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_error_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to transfer batch to payroll. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: batchId,
        transferred_transfer_lines: helpers.num('p_transferred_transfer_lines'),
        error_transfer_lines: helpers.num('p_error_transfer_lines')
      })
    }
  );
}

export async function reconcileTransferBatch(batchId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.RECONCILE_TRANSFER_BATCH(
    P_PAYROLL_TRANSFER_BATCH_ID  => :p_payroll_transfer_batch_id,
    P_ACTOR                      => :p_actor,
    P_RECONCILIATION_STATUS_CODE => :p_reconciliation_status_code,
    P_SOURCE_TOTAL               => :p_source_total,
    P_PAYROLL_TOTAL              => :p_payroll_total,
    P_VARIANCE                   => :p_variance,
    P_MESSAGE                    => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_actor: stringBind(actor, 100),
      p_reconciliation_status_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_source_total: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_payroll_total: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_variance: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to reconcile transfer batch. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: batchId,
        reconciliation_status_code: helpers.str('p_reconciliation_status_code'),
        source_total: helpers.num('p_source_total'),
        payroll_total: helpers.num('p_payroll_total'),
        variance: helpers.num('p_variance')
      })
    }
  );
}

export async function lockTransferBatch(batchId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.LOCK_TRANSFER_BATCH(
    P_PAYROLL_TRANSFER_BATCH_ID => :p_payroll_transfer_batch_id,
    P_ACTOR                     => :p_actor,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_actor: stringBind(actor, 100),
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to lock transfer batch. Please try again.',
      mapOut: () => ({ payroll_transfer_batch_id: batchId })
    }
  );
}

export async function reverseTransferBatch(batchId, reversalReason, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.REVERSE_TRANSFER_BATCH(
    P_PAYROLL_TRANSFER_BATCH_ID => :p_payroll_transfer_batch_id,
    P_REVERSAL_REASON           => :p_reversal_reason,
    P_ACTOR                     => :p_actor,
    P_REVERSED_TRANSFER_LINES   => :p_reversed_transfer_lines,
    P_REVERSAL_REQUIRED_LINES   => :p_reversal_required_lines,
    P_SUCCESS                   => :p_success,
    P_MESSAGE                   => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_batch_id: numberBind(batchId),
      p_reversal_reason: stringBind(reversalReason, 4000),
      p_actor: stringBind(actor, 100),
      p_reversed_transfer_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_reversal_required_lines: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to reverse transfer batch. Please try again.',
      mapOut: (out, helpers) => ({
        payroll_transfer_batch_id: batchId,
        reversed_transfer_lines: helpers.num('p_reversed_transfer_lines'),
        reversal_required_lines: helpers.num('p_reversal_required_lines')
      })
    }
  );
}

export async function retryTransferLine(lineId, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.RETRY_TRANSFER_LINE(
    P_PAYROLL_TRANSFER_LINE_ID => :p_payroll_transfer_line_id,
    P_ACTOR                    => :p_actor,
    P_SUCCESS                  => :p_success,
    P_MESSAGE                  => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_line_id: numberBind(lineId),
      p_actor: stringBind(actor, 100),
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to retry transfer line. Please try again.',
      mapOut: () => ({ payroll_transfer_line_id: lineId })
    }
  );
}

export async function reverseTransferLine(lineId, reversalReason, actor) {
  const plsql = `
BEGIN
  ${XFER_PKG}.REVERSE_TRANSFER_LINE(
    P_PAYROLL_TRANSFER_LINE_ID => :p_payroll_transfer_line_id,
    P_REVERSAL_REASON          => :p_reversal_reason,
    P_ACTOR                    => :p_actor,
    P_SUCCESS                  => :p_success,
    P_MESSAGE                  => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_payroll_transfer_line_id: numberBind(lineId),
      p_reversal_reason: stringBind(reversalReason, 4000),
      p_actor: stringBind(actor, 100),
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 40 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
    },
    {
      genericError: 'Unable to reverse transfer line. Please try again.',
      mapOut: () => ({ payroll_transfer_line_id: lineId })
    }
  );
}

/** Dashboard helpers backed by transfer/activation views. */
export async function dashboardTransferSummary(filters) {
  return queryPayList({
    fromSql: `${V_BATCHES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmDashboardTransfers'
  });
}

export async function dashboardTransferExceptions(filters) {
  return queryPayList({
    fromSql: `${V_LINES} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      {
        sql: `(v.STATUS_CODE IN ('ERROR','FAILED') OR NVL(v.REVERSED_FLAG,'N') = 'Y')`,
        value: true,
        skipIfEmpty: false
      }
    ],
    defaultSort: 'v.LAST_UPDATE_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmDashboardTransferExceptions'
  });
}

export async function dashboardHourlyRateReadiness(filters) {
  return queryPayList({
    fromSql: MAPPING_FROM,
    selectSql: MAPPING_SELECT,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode ?? 'ACTIVE' }
    ],
    defaultSort: 'v.LAST_UPDATE_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'tmDashboardHourlyRateReadiness'
  });
}
