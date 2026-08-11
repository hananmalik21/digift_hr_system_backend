/**
 * Retroactive payroll + overpayment/arrears processing.
 *
 * Packages:
 *   PAY.PAY_RETRO_PROCESSING_PKG.PROCESS_CORRECTION   — creates + processes a positive retro event atomically
 *   PAY.PAY_RETRO_RECOVERY_PKG                        — CREATE_RECOVERY_ENTRY, FINALIZE_RECOVERY,
 *                                                        PROCESS_NEGATIVE_REVISION, REVERSE_EVENT
 * Views:
 *   PAY.V_PAY_RETRO_EVENTS, PAY.V_PAY_RETRO_EVENT_LINES,
 *   PAY.V_PAY_OVERPAYMENT_ARREARS, PAY.V_PAY_ARREARS_RECOVERIES
 */

import oracledb from 'oracledb';
import { dateBind, executePayrollPackage, numberBind, queryPayList, queryPayOne, stringBind } from '../shared/index.js';

const RETRO_PKG = 'PAY.PAY_RETRO_PROCESSING_PKG';
const RECOVERY_PKG = 'PAY.PAY_RETRO_RECOVERY_PKG';

const EVENTS_VIEW = 'PAY.V_PAY_RETRO_EVENTS';
const LINES_VIEW = 'PAY.V_PAY_RETRO_EVENT_LINES';
const ARREARS_VIEW = 'PAY.V_PAY_OVERPAYMENT_ARREARS';
const RECOVERIES_VIEW = 'PAY.V_PAY_ARREARS_RECOVERIES';

function outNum(name) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } };
}
function outStr(name, maxSize = 4000) {
  return { [name]: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize } };
}

// --- Retro events ------------------------------------------------------------------------

const EVENT_SORT_MAP = {
  created: 'v.CREATION_DATE',
  processed: 'v.PROCESSED_DATE',
  status: 'v.STATUS_CODE'
};

export async function listRetroEvents(filters) {
  return queryPayList({
    fromSql: `${EVENTS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.SOURCE_RUN_ID = :source_run_id', bind: 'source_run_id', value: filters.sourceRunId },
      { sql: 'v.TARGET_RUN_ID = :target_run_id', bind: 'target_run_id', value: filters.targetRunId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    search: { columns: ['v.EVENT_CODE', 'v.SOURCE_ELEMENT_CODE', 'v.SOURCE_ELEMENT_NAME'], value: filters.search },
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: EVENT_SORT_MAP,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollRetroEvents'
  });
}

export async function getRetroEventById(retroEventId) {
  return queryPayOne({
    fromSql: `${EVENTS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.RETRO_EVENT_ID = :id', bind: 'id', value: retroEventId }],
    logTag: 'payrollRetroEvents'
  });
}

export async function listRetroEventLines(retroEventId) {
  const { data } = await queryPayList({
    fromSql: `${LINES_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.RETRO_EVENT_ID = :retro_event_id', bind: 'retro_event_id', value: retroEventId }],
    defaultSort: 'v.LINE_SEQUENCE ASC',
    page: 1,
    pageSize: 500,
    logTag: 'payrollRetroEventLines'
  });
  return data;
}

/**
 * PROCESS_CORRECTION — all IN/OUT params exactly as specified on PAY_RETRO_PROCESSING_PKG.
 */
export async function processCorrection(body, processedBy) {
  const plsql = `
BEGIN
  ${RETRO_PKG}.PROCESS_CORRECTION(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PAYROLL_ID             => :p_payroll_id,
    P_EMPLOYEE_ID            => :p_employee_id,
    P_SOURCE_RUN_ID          => :p_source_run_id,
    P_SOURCE_ELEMENT_ID      => :p_source_element_id,
    P_CORRECTED_VALUE        => :p_corrected_value,
    P_PAYMENT_PERIOD_START   => :p_payment_period_start,
    P_PAYMENT_PERIOD_END     => :p_payment_period_end,
    P_PAYMENT_DATE           => :p_payment_date,
    P_REASON_CODE            => :p_reason_code,
    P_REASON_TEXT            => :p_reason_text,
    P_UPDATE_RECURRING_FLAG  => :p_update_recurring_flag,
    P_PROCESSED_BY           => :p_processed_by,
    P_RETRO_EVENT_ID         => :p_retro_event_id,
    P_RETRO_EVENT_GUID       => :p_retro_event_guid,
    P_RETRO_RUN_ID           => :p_retro_run_id,
    P_RETRO_RUN_GUID         => :p_retro_run_guid,
    P_SOURCE_DELTA           => :p_source_delta,
    P_GROSS_DELTA            => :p_gross_delta,
    P_DEDUCTION_DELTA        => :p_deduction_delta,
    P_NET_DELTA              => :p_net_delta,
    P_SUCCESS                => :p_success,
    P_MESSAGE                => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_payroll_id: numberBind(body.payroll_id),
      p_employee_id: numberBind(body.employee_id),
      p_source_run_id: numberBind(body.source_run_id),
      p_source_element_id: numberBind(body.source_element_id),
      p_corrected_value: numberBind(body.corrected_value),
      p_payment_period_start: dateBind(body.payment_period_start),
      p_payment_period_end: dateBind(body.payment_period_end),
      p_payment_date: dateBind(body.payment_date),
      p_reason_code: stringBind(body.reason_code, 100),
      p_reason_text: stringBind(body.reason_text, 4000),
      p_update_recurring_flag: stringBind(body.update_recurring_flag ?? 'Y', 1),
      p_processed_by: stringBind(processedBy, 100),
      ...outNum('p_retro_event_id'),
      ...outStr('p_retro_event_guid', 32),
      ...outNum('p_retro_run_id'),
      ...outStr('p_retro_run_guid', 32),
      ...outNum('p_source_delta'),
      ...outNum('p_gross_delta'),
      ...outNum('p_deduction_delta'),
      ...outNum('p_net_delta'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to process retro correction. Please try again.',
      mapOut: (out, helpers) => ({
        retro_event_id: helpers.num('p_retro_event_id'),
        retro_event_guid: helpers.guid('p_retro_event_guid'),
        retro_run_id: helpers.num('p_retro_run_id'),
        retro_run_guid: helpers.guid('p_retro_run_guid'),
        source_delta: helpers.num('p_source_delta'),
        gross_delta: helpers.num('p_gross_delta'),
        deduction_delta: helpers.num('p_deduction_delta'),
        net_delta: helpers.num('p_net_delta')
      })
    }
  );
}

/** No procedure exists to add a retro line independently — lines are generated by PROCESS_CORRECTION. */
export function addRetroEventLineUnsupportedMessage() {
  return 'Retro event lines are generated automatically by PAY_RETRO_PROCESSING_PKG.PROCESS_CORRECTION; direct line creation is not supported.';
}

/**
 * There is no standalone "calculate" procedure — PROCESS_CORRECTION computes and applies the
 * delta in one call. This returns the already-computed comparison for review purposes.
 */
export async function calculateRetroComparison(retroEventId) {
  const event = await getRetroEventById(retroEventId);
  if (!event) return null;
  const lines = await listRetroEventLines(retroEventId);
  return { event, lines };
}

/** PROCESS_CORRECTION already creates and processes the event; this is an idempotent status check. */
export async function ensureRetroEventProcessed(retroEventId) {
  const event = await getRetroEventById(retroEventId);
  if (!event) return null;
  return { event, already_processed: event.status_code === 'PROCESSED' };
}

/**
 * REVERSE_EVENT(P_ENTERPRISE_ID, P_RETRO_EVENT_ID, P_REASON, P_REVERSED_BY, OUT P_SUCCESS, P_MESSAGE)
 */
export async function reverseRetroEvent(enterpriseId, retroEventId, reason, reversedBy) {
  const plsql = `
BEGIN
  ${RECOVERY_PKG}.REVERSE_EVENT(
    P_ENTERPRISE_ID  => :p_enterprise_id,
    P_RETRO_EVENT_ID => :p_retro_event_id,
    P_REASON         => :p_reason,
    P_REVERSED_BY    => :p_reversed_by,
    P_SUCCESS        => :p_success,
    P_MESSAGE        => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_retro_event_id: numberBind(retroEventId),
      p_reason: stringBind(reason, 4000),
      p_reversed_by: stringBind(reversedBy, 100),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    { genericError: 'Unable to reverse retro event. Please try again.' }
  );
}

// --- Overpayments / arrears --------------------------------------------------------------

const ARREAR_SORT_MAP = {
  created: 'v.CREATION_DATE',
  status: 'v.STATUS_CODE',
  next_recovery: 'v.NEXT_RECOVERY_DATE'
};

export async function listArrears(filters) {
  return queryPayList({
    fromSql: `${ARREARS_VIEW} v`,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterpriseId },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payrollId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employeeId },
      { sql: 'v.RETRO_EVENT_ID = :retro_event_id', bind: 'retro_event_id', value: filters.retroEventId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.statusCode }
    ],
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    allowedSort: ARREAR_SORT_MAP,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: 'payrollArrears'
  });
}

export async function getArrearById(arrearId) {
  return queryPayOne({
    fromSql: `${ARREARS_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.ARREAR_ID = :id', bind: 'id', value: arrearId }],
    logTag: 'payrollArrears'
  });
}

/**
 * PROCESS_NEGATIVE_REVISION — creates the retro event + arrear for an overpayment.
 */
export async function processNegativeRevision(body, processedBy) {
  const plsql = `
BEGIN
  ${RECOVERY_PKG}.PROCESS_NEGATIVE_REVISION(
    P_ENTERPRISE_ID          => :p_enterprise_id,
    P_PAYROLL_ID             => :p_payroll_id,
    P_EMPLOYEE_ID            => :p_employee_id,
    P_ORIGINAL_SOURCE_RUN_ID => :p_original_source_run_id,
    P_SOURCE_ELEMENT_ID      => :p_source_element_id,
    P_REVISED_VALUE          => :p_revised_value,
    P_PAYMENT_PERIOD_START   => :p_payment_period_start,
    P_PAYMENT_PERIOD_END     => :p_payment_period_end,
    P_PAYMENT_DATE           => :p_payment_date,
    P_REASON_CODE            => :p_reason_code,
    P_REASON_TEXT            => :p_reason_text,
    P_PROCESSED_BY           => :p_processed_by,
    P_RETRO_EVENT_ID         => :p_retro_event_id,
    P_RETRO_RUN_ID           => :p_retro_run_id,
    P_ARREAR_ID              => :p_arrear_id,
    P_CURRENT_VALUE          => :p_current_value,
    P_SOURCE_DELTA           => :p_source_delta,
    P_TAX_DELTA              => :p_tax_delta,
    P_NET_DELTA              => :p_net_delta,
    P_OUTSTANDING_ARREARS    => :p_outstanding_arrears,
    P_SUCCESS                => :p_success,
    P_MESSAGE                => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(body.enterprise_id),
      p_payroll_id: numberBind(body.payroll_id),
      p_employee_id: numberBind(body.employee_id),
      p_original_source_run_id: numberBind(body.original_source_run_id),
      p_source_element_id: numberBind(body.source_element_id),
      p_revised_value: numberBind(body.revised_value),
      p_payment_period_start: dateBind(body.payment_period_start),
      p_payment_period_end: dateBind(body.payment_period_end),
      p_payment_date: dateBind(body.payment_date),
      p_reason_code: stringBind(body.reason_code, 100),
      p_reason_text: stringBind(body.reason_text, 4000),
      p_processed_by: stringBind(processedBy, 100),
      ...outNum('p_retro_event_id'),
      ...outNum('p_retro_run_id'),
      ...outNum('p_arrear_id'),
      ...outNum('p_current_value'),
      ...outNum('p_source_delta'),
      ...outNum('p_tax_delta'),
      ...outNum('p_net_delta'),
      ...outNum('p_outstanding_arrears'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to process negative revision. Please try again.',
      mapOut: (out, helpers) => ({
        retro_event_id: helpers.num('p_retro_event_id'),
        retro_run_id: helpers.num('p_retro_run_id'),
        arrear_id: helpers.num('p_arrear_id'),
        current_value: helpers.num('p_current_value'),
        source_delta: helpers.num('p_source_delta'),
        tax_delta: helpers.num('p_tax_delta'),
        net_delta: helpers.num('p_net_delta'),
        outstanding_arrears: helpers.num('p_outstanding_arrears')
      })
    }
  );
}

export async function listArrearRecoveries(arrearId, pagination = { page: 1, pageSize: 100 }) {
  return queryPayList({
    fromSql: `${RECOVERIES_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.ARREAR_ID = :arrear_id', bind: 'arrear_id', value: arrearId }],
    defaultSort: 'v.CREATION_DATE DESC',
    page: pagination.page,
    pageSize: pagination.pageSize,
    logTag: 'payrollArrearsRecoveries'
  });
}

export async function getRecoveryById(recoveryId) {
  return queryPayOne({
    fromSql: `${RECOVERIES_VIEW} v`,
    alias: 'v',
    filters: [{ sql: 'v.RECOVERY_ID = :id', bind: 'id', value: recoveryId }],
    logTag: 'payrollArrearsRecoveries'
  });
}

/**
 * CREATE_RECOVERY_ENTRY(P_ENTERPRISE_ID, P_ARREAR_ID, P_RUN_ID, P_AVAILABLE_NET_PAY, P_CREATED_BY,
 *   OUT P_RECOVERY_ID, P_ELEMENT_ENTRY_ID, P_RECOVERY_AMOUNT, P_REMAINING_ESTIMATE, P_SUCCESS, P_MESSAGE)
 */
export async function createRecoveryEntry(enterpriseId, arrearId, runId, availableNetPay, createdBy) {
  const plsql = `
BEGIN
  ${RECOVERY_PKG}.CREATE_RECOVERY_ENTRY(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_ARREAR_ID         => :p_arrear_id,
    P_RUN_ID            => :p_run_id,
    P_AVAILABLE_NET_PAY => :p_available_net_pay,
    P_CREATED_BY        => :p_created_by,
    P_RECOVERY_ID       => :p_recovery_id,
    P_ELEMENT_ENTRY_ID  => :p_element_entry_id,
    P_RECOVERY_AMOUNT   => :p_recovery_amount,
    P_REMAINING_ESTIMATE=> :p_remaining_estimate,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_arrear_id: numberBind(arrearId),
      p_run_id: numberBind(runId),
      p_available_net_pay: numberBind(availableNetPay),
      p_created_by: stringBind(createdBy, 100),
      ...outNum('p_recovery_id'),
      ...outNum('p_element_entry_id'),
      ...outNum('p_recovery_amount'),
      ...outNum('p_remaining_estimate'),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to create arrears recovery entry. Please try again.',
      mapOut: (out, helpers) => ({
        recovery_id: helpers.num('p_recovery_id'),
        element_entry_id: helpers.num('p_element_entry_id'),
        recovery_amount: helpers.num('p_recovery_amount'),
        remaining_estimate: helpers.num('p_remaining_estimate')
      })
    }
  );
}

/**
 * FINALIZE_RECOVERY(P_ENTERPRISE_ID, P_RECOVERY_ID, P_FINALIZED_BY,
 *   OUT P_APPLIED_AMOUNT, P_OUTSTANDING_AMOUNT, P_ARREAR_STATUS, P_SUCCESS, P_MESSAGE)
 */
export async function finalizeRecovery(enterpriseId, recoveryId, finalizedBy) {
  const plsql = `
BEGIN
  ${RECOVERY_PKG}.FINALIZE_RECOVERY(
    P_ENTERPRISE_ID     => :p_enterprise_id,
    P_RECOVERY_ID       => :p_recovery_id,
    P_FINALIZED_BY      => :p_finalized_by,
    P_APPLIED_AMOUNT    => :p_applied_amount,
    P_OUTSTANDING_AMOUNT=> :p_outstanding_amount,
    P_ARREAR_STATUS     => :p_arrear_status,
    P_SUCCESS           => :p_success,
    P_MESSAGE           => :p_message
  );
END;`;

  return executePayrollPackage(
    plsql,
    {
      p_enterprise_id: numberBind(enterpriseId),
      p_recovery_id: numberBind(recoveryId),
      p_finalized_by: stringBind(finalizedBy, 100),
      ...outNum('p_applied_amount'),
      ...outNum('p_outstanding_amount'),
      ...outStr('p_arrear_status', 30),
      ...outStr('p_success', 40),
      ...outStr('p_message')
    },
    {
      genericError: 'Unable to finalize arrears recovery. Please try again.',
      mapOut: (out, helpers) => ({
        applied_amount: helpers.num('p_applied_amount'),
        outstanding_amount: helpers.num('p_outstanding_amount'),
        arrear_status: helpers.str('p_arrear_status')
      })
    }
  );
}

/** Convenience: create the recovery entry and immediately finalize it in one call. */
export async function recoverArrear(enterpriseId, arrearId, runId, availableNetPay, actor) {
  const created = await createRecoveryEntry(enterpriseId, arrearId, runId, availableNetPay, actor);
  if (!created.success) return created;

  const finalized = await finalizeRecovery(enterpriseId, created.data.recovery_id, actor);
  return {
    ...finalized,
    data: { ...created.data, ...finalized.data }
  };
}

/** No package exists for reversing a finalized recovery or force-closing an arrear. */
export function noRecoveryReversalPackageMessage() {
  return 'Reversing a finalized recovery is not supported by PAY_RETRO_RECOVERY_PKG; no such procedure is exposed.';
}

export function noArrearCloseWithoutRecoveryPackageMessage() {
  return 'Closing an arrear outside of FINALIZE_RECOVERY reaching a zero balance is not supported by PAY_RETRO_RECOVERY_PKG.';
}
