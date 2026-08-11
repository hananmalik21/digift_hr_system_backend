/**
 * Row mappers and period helpers for compensation transfer.
 */

import { mapAvailableForTransferPayrollDefinitionRow } from '../../payroll_definitions/utils/payPayrollDefinitionsAvailableForTransferSql.js';
import {
  MESSAGES,
  TRANSFER_STATUS
} from '../constants/payCompensationTransfer.constants.js';

export { mapAvailableForTransferPayrollDefinitionRow as mapAvailablePayrollDefinitionRow };

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function upperRow(row) {
  return rowKeysUpper(row);
}

/**
 * Resolve compensation processing period using the same rules as the package:
 * 1. PROCESS_MONTH_NO + PROCESS_YEAR
 * 2. RUN_START_DATE + RUN_END_DATE
 */
export function resolvePayRunPeriod(payRun) {
  const month = toNumberOrNull(payRun?.PROCESS_MONTH_NO ?? payRun?.process_month_no);
  const year = toNumberOrNull(payRun?.PROCESS_YEAR ?? payRun?.process_year);

  if (month != null && year != null && month >= 1 && month <= 12 && year >= 1900) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      period_start_date: `${year}-${pad2(month)}-01`,
      period_end_date: `${year}-${pad2(month)}-${pad2(lastDay)}`
    };
  }

  return {
    period_start_date: toIsoDateOrNull(payRun?.RUN_START_DATE ?? payRun?.run_start_date),
    period_end_date: toIsoDateOrNull(payRun?.RUN_END_DATE ?? payRun?.run_end_date)
  };
}

export function mapPayrollResponseSummary(payroll) {
  if (!payroll) return null;
  return {
    payroll_id: payroll.payroll_id,
    payroll_guid: payroll.payroll_guid,
    payroll_name: payroll.payroll_name,
    payroll_code: payroll.payroll_code
  };
}

export function mapTransferredEntryRow(row) {
  const r = rowKeysUpper(row);
  const batchId = toNumberOrNull(r.COMP_PAY_RUN_ID);
  return {
    element_entry_id: toNumberOrNull(r.ELEMENT_ENTRY_ID),
    element_entry_guid: toStringOrNull(r.ELEMENT_ENTRY_GUID),
    enterprise_id: toNumberOrNull(r.ENTERPRISE_ID),
    employee_id: toNumberOrNull(r.EMPLOYEE_ID),
    element_id: toNumberOrNull(r.ELEMENT_ID),
    element_code: toStringOrNull(r.ELEMENT_CODE),
    element_name: toStringOrNull(r.ELEMENT_NAME),
    payroll_id: toNumberOrNull(r.PAYROLL_ID),
    payroll_guid: toStringOrNull(r.PAYROLL_GUID),
    payroll_name: toStringOrNull(r.PAYROLL_NAME),
    payroll_code: toStringOrNull(r.PAYROLL_CODE),
    payroll_status: toStringOrNull(r.PAYROLL_STATUS),
    comp_pay_run_id: batchId,
    batch_id: batchId,
    source_code: toStringOrNull(r.SOURCE_CODE),
    source_reference: toStringOrNull(r.SOURCE_REFERENCE),
    sequence_number: toNumberOrNull(r.SEQUENCE_NUMBER),
    reason_text: toStringOrNull(r.REASON_TEXT),
    effective_as_of_date: toIsoDateOrNull(r.EFFECTIVE_AS_OF_DATE),
    effective_start_date: toIsoDateOrNull(r.EFFECTIVE_START_DATE),
    effective_end_date: toIsoDateOrNull(r.EFFECTIVE_END_DATE),
    retroactive_flag: toStringOrNull(r.RETROACTIVE_FLAG),
    processed_flag: toStringOrNull(r.PROCESSED_FLAG),
    approval_status_code: toStringOrNull(r.APPROVAL_STATUS_CODE),
    void_flag: toStringOrNull(r.VOID_FLAG),
    delete_flag: toStringOrNull(r.DELETE_FLAG),
    entry_value_id: toNumberOrNull(r.ENTRY_VALUE_ID),
    currency_code: toStringOrNull(r.CURRENCY_CODE),
    amount: toNumberOrNull(r.AMOUNT),
    retro_amount: toNumberOrNull(r.RETRO_AMOUNT),
    pay_value: toNumberOrNull(r.PAY_VALUE),
    created_by: toStringOrNull(r.CREATED_BY),
    creation_date: toIsoDateTimeOrNull(r.CREATION_DATE)
  };
}

export function mapEntryResultSummary(entry) {
  if (!entry) return null;
  return {
    element_entry_id: entry.element_entry_id,
    element_entry_guid: entry.element_entry_guid,
    payroll_id: entry.payroll_id,
    batch_id: entry.batch_id ?? entry.comp_pay_run_id,
    source_reference: entry.source_reference,
    retroactive_flag: entry.retroactive_flag,
    currency_code: entry.currency_code,
    amount: entry.amount ?? 0,
    retro_amount: entry.retro_amount ?? 0,
    pay_value: entry.pay_value ?? 0
  };
}

export function isRetroEntry(entry) {
  return String(entry?.retroactive_flag || 'N').toUpperCase() === 'Y';
}

export function resolveLineTransferMessage(
  transferStatus,
  packageMessage,
  regularSummary,
  retroSummary
) {
  if (packageMessage) return packageMessage;
  if (transferStatus === TRANSFER_STATUS.SKIPPED) return MESSAGES.LINE_SKIPPED;
  if (regularSummary && retroSummary) return MESSAGES.LINE_REGULAR_AND_RETRO;
  if (regularSummary) return MESSAGES.LINE_REGULAR_ONLY;
  return MESSAGES.LINE_COMPLETED;
}

export function inferPayRunTransferStatus({ failedCount, transferredCount, skippedCount }) {
  if (failedCount > 0) return TRANSFER_STATUS.FAILED;
  if (transferredCount > 0 && skippedCount > 0) return TRANSFER_STATUS.PARTIAL;
  if (transferredCount > 0) return TRANSFER_STATUS.TRANSFERRED;
  if (skippedCount > 0) return TRANSFER_STATUS.SKIPPED;
  return TRANSFER_STATUS.COMPLETED;
}

export function toNumberField(value) {
  return toNumberOrNull(value);
}

export function toStringField(value) {
  return toStringOrNull(value);
}
