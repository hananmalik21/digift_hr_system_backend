/**
 * Nested mapper for PAY.V_PAY_PERSON_RESULT_DASHBOARD.
 * Parses Oracle JSON/CLOB columns and does not rebuild payroll math.
 */

import { mapGuid, toIsoDateOrNull, toIsoDateTimeOrNull, toNumberOrNull } from '../../shared/payrollRowMapper.js';
import { parseOracleJsonField } from './payPersonResultsMappers.js';

function pick(row, key) {
  const upper = key.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];
  if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
  return undefined;
}

function asText(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function ynToBool(value) {
  return String(value ?? '').trim().toUpperCase() === 'Y';
}

export async function parseOracleJson(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const parsed = await parseOracleJsonField(value);
  if (parsed == null || parsed === '') return fallback;
  if (typeof parsed === 'string') return fallback;
  return parsed;
}

/** 263 → "4m 23s". Preserves 0 as "0s". */
export function formatProcessingSeconds(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n < 0) return null;
  const total = Math.round(n);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (secs || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}

function withProcessingDisplay(metrics) {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) return metrics;
  if (metrics.processing_seconds == null) return metrics;
  return {
    ...metrics,
    processing_time_display: formatProcessingSeconds(metrics.processing_seconds)
  };
}

function pickDistribution(parsed, row) {
  const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  return {
    gross_pay: obj.gross_pay ?? toNumberOrNull(pick(row, 'GROSS_PAY')),
    deductions: obj.deductions ?? toNumberOrNull(pick(row, 'DEDUCTIONS')),
    net_pay: obj.net_pay ?? toNumberOrNull(pick(row, 'NET_PAY')),
    employer_cost: obj.employer_cost ?? toNumberOrNull(pick(row, 'EMPLOYER_COST')),
    currency_code: obj.currency_code ?? asText(pick(row, 'DISTRIBUTION_CURRENCY_CODE'))
  };
}

export async function mapPersonResultDashboardRow(row) {
  if (!row) return null;

  const [
    relationAction,
    payrollDefinition,
    timeline,
    rateDetails,
    earningsBreakdown,
    executionMetrics,
    distributionObj
  ] = await Promise.all([
    parseOracleJson(pick(row, 'REL_ACTION_OBJ'), {}),
    parseOracleJson(pick(row, 'PAYROLL_DEFINITION_OBJ'), {}),
    parseOracleJson(pick(row, 'PAYROLL_TIMELINE_OBJ'), {}),
    parseOracleJson(pick(row, 'RATE_DETAILS_OBJ'), []),
    parseOracleJson(pick(row, 'EARNINGS_BREAKDOWN_OBJ'), []),
    parseOracleJson(pick(row, 'EXECUTION_METRICS_OBJ'), {}),
    parseOracleJson(pick(row, 'PAYROLL_DISTRIBUTION_OBJ'), {})
  ]);

  return {
    person: {
      enterprise_id: toNumberOrNull(pick(row, 'ENTERPRISE_ID')),
      employee_id: toNumberOrNull(pick(row, 'EMPLOYEE_ID')),
      employee_guid: mapGuid(pick(row, 'EMPLOYEE_GUID')),
      assignment_id: toNumberOrNull(pick(row, 'ASSIGNMENT_ID')),
      assignment_guid: mapGuid(pick(row, 'ASSIGNMENT_GUID')),
      employee_name: asText(pick(row, 'EMPLOYEE_NAME')),
      person_number: asText(pick(row, 'PERSON_NUMBER')),
      assignment_number: asText(pick(row, 'ASSIGNMENT_NUMBER')),
      business_title: asText(pick(row, 'BUSINESS_TITLE')),
      assignment_status: asText(pick(row, 'ASSIGNMENT_STATUS')),
      employment_status: asText(pick(row, 'EMPLOYMENT_STATUS')),
      worker_type: asText(pick(row, 'WORKER_TYPE')),
      work_email: asText(pick(row, 'WORK_EMAIL')),
      work_phone: asText(pick(row, 'WORK_PHONE')),
      mobile_number: asText(pick(row, 'MOBILE_NUMBER'))
    },
    run: {
      run_id: toNumberOrNull(pick(row, 'RUN_ID')),
      run_guid: mapGuid(pick(row, 'RUN_GUID')),
      run_number: asText(pick(row, 'RUN_NUMBER')),
      run_type_code: asText(pick(row, 'RUN_TYPE_CODE')),
      run_status_code: asText(pick(row, 'RUN_STATUS_CODE')),
      employee_action_status_code: asText(pick(row, 'EMPLOYEE_ACTION_STATUS_CODE')),
      status: asText(pick(row, 'STATUS'))
    },
    relation_action: relationAction,
    payroll_definition: payrollDefinition,
    period: {
      period_start_date: toIsoDateOrNull(pick(row, 'PERIOD_START_DATE')),
      period_end_date: toIsoDateOrNull(pick(row, 'PERIOD_END_DATE')),
      payroll_period: asText(pick(row, 'PAYROLL_PERIOD')),
      payment_date: toIsoDateOrNull(pick(row, 'PAYMENT_DATE')),
      warning: ynToBool(pick(row, 'PERIOD_WARNING_FLAG'))
    },
    timeline,
    rate_details: Array.isArray(rateDetails) ? rateDetails : [],
    earnings_breakdown: Array.isArray(earningsBreakdown) ? earningsBreakdown : [],
    execution_metrics: withProcessingDisplay(executionMetrics),
    distribution: pickDistribution(distributionObj, row),
    calculation: {
      result_count: toNumberOrNull(pick(row, 'RESULT_COUNT')),
      calculated_result_total: toNumberOrNull(pick(row, 'CALCULATED_RESULT_TOTAL')),
      amount: toNumberOrNull(pick(row, 'AMOUNT')),
      currency_code: asText(pick(row, 'CURRENCY_CODE')),
      process_date: toIsoDateTimeOrNull(pick(row, 'PROCESS_DATE'))
    },
    actions: {
      can_view_results: ynToBool(pick(row, 'CAN_VIEW_RESULTS')),
      run_id: toNumberOrNull(pick(row, 'ACTION_RUN_ID')),
      rel_action_id: toNumberOrNull(pick(row, 'ACTION_REL_ACTION_ID')),
      payroll_definition_id: toNumberOrNull(pick(row, 'ACTION_PAYROLL_DEFINITION_ID')),
      employee_id: toNumberOrNull(pick(row, 'ACTION_EMPLOYEE_ID'))
    }
  };
}
