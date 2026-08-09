/**
 * DigifyHR Payroll — Run processing package calls.
 * Package: PAY.PAYROLL_PROCESSING_PKG
 */

import {
  dateBind,
  executePayrollPackage,
  numberBind,
  outGuid,
  outNumber,
  outString,
  stringBind,
  ynBind
} from '../../shared/index.js';

const PKG = 'PAY.PAYROLL_PROCESSING_PKG';

function successAndMessageOut() {
  return { ...outString('p_success', 40), ...outString('p_message', 4000) };
}

/**
 * @param {{
 *   enterprise_id: number, payroll_id: number, run_type_code: string,
 *   period_start_date: string|Date, period_end_date: string|Date,
 *   payment_date: string|Date, run_number: number, created_by: string
 * }} payload
 */
export async function initializeRun(payload) {
  const plsql = `
    BEGIN
      ${PKG}.INITIALIZE_RUN(
        P_ENTERPRISE_ID     => :p_enterprise_id,
        P_PAYROLL_ID        => :p_payroll_id,
        P_RUN_TYPE_CODE     => :p_run_type_code,
        P_PERIOD_START_DATE => :p_period_start_date,
        P_PERIOD_END_DATE   => :p_period_end_date,
        P_PAYMENT_DATE      => :p_payment_date,
        P_RUN_NUMBER        => :p_run_number,
        P_CREATED_BY        => :p_created_by,
        P_RUN_ID            => :p_run_id,
        P_RUN_GUID          => :p_run_guid,
        P_SUCCESS           => :p_success,
        P_MESSAGE           => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_payroll_id: numberBind(payload.payroll_id),
    p_run_type_code: stringBind(payload.run_type_code, 30),
    p_period_start_date: dateBind(payload.period_start_date),
    p_period_end_date: dateBind(payload.period_end_date),
    p_payment_date: dateBind(payload.payment_date),
    p_run_number: stringBind(payload.run_number, 100),
    p_created_by: stringBind(payload.created_by, 100),
    ...outNumber('p_run_id'),
    ...outGuid('p_run_guid'),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to initialize the payroll run.',
    mapOut: (out, helpers) => ({
      run_id: helpers.num('p_run_id'),
      run_guid: helpers.guid('p_run_guid')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, prepared_by: string }} payload
 */
export async function prepareRunEmployees(payload) {
  const plsql = `
    BEGIN
      ${PKG}.PREPARE_RUN_EMPLOYEES(
        P_ENTERPRISE_ID  => :p_enterprise_id,
        P_RUN_ID         => :p_run_id,
        P_PREPARED_BY    => :p_prepared_by,
        P_EMPLOYEE_COUNT => :p_employee_count,
        P_ENTRY_COUNT    => :p_entry_count,
        P_TOTAL_PAY_VALUE => :p_total_pay_value,
        P_SUCCESS        => :p_success,
        P_MESSAGE        => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_prepared_by: stringBind(payload.prepared_by, 100),
    ...outNumber('p_employee_count'),
    ...outNumber('p_entry_count'),
    ...outNumber('p_total_pay_value'),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to prepare employees for this payroll run.',
    mapOut: (out, helpers) => ({
      employee_count: helpers.num('p_employee_count'),
      entry_count: helpers.num('p_entry_count'),
      total_pay_value: helpers.num('p_total_pay_value')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id: number, processed_by: string }} payload
 */
export async function processEmployee(payload) {
  const plsql = `
    BEGIN
      ${PKG}.PROCESS_EMPLOYEE(
        P_ENTERPRISE_ID     => :p_enterprise_id,
        P_RUN_ID            => :p_run_id,
        P_EMPLOYEE_ID       => :p_employee_id,
        P_PROCESSED_BY      => :p_processed_by,
        P_ENTRY_COUNT       => :p_entry_count,
        P_RESULT_COUNT      => :p_result_count,
        P_TRANSACTION_COUNT => :p_transaction_count,
        P_STATUS            => :p_status,
        P_SUCCESS           => :p_success,
        P_MESSAGE           => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_employee_id: numberBind(payload.employee_id),
    p_processed_by: stringBind(payload.processed_by, 100),
    ...outNumber('p_entry_count'),
    ...outNumber('p_result_count'),
    ...outNumber('p_transaction_count'),
    ...outString('p_status', 80),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to process this employee.',
    mapOut: (out, helpers) => ({
      entry_count: helpers.num('p_entry_count'),
      result_count: helpers.num('p_result_count'),
      transaction_count: helpers.num('p_transaction_count'),
      status: helpers.str('p_status')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, stop_on_error: 'Y'|'N', processed_by: string }} payload
 */
export async function processRun(payload) {
  const plsql = `
    BEGIN
      ${PKG}.PROCESS_RUN(
        P_ENTERPRISE_ID           => :p_enterprise_id,
        P_RUN_ID                  => :p_run_id,
        P_STOP_ON_ERROR           => :p_stop_on_error,
        P_PROCESSED_BY            => :p_processed_by,
        P_EMPLOYEE_SUCCESS_COUNT  => :p_employee_success_count,
        P_EMPLOYEE_SKIPPED_COUNT  => :p_employee_skipped_count,
        P_EMPLOYEE_ERROR_COUNT    => :p_employee_error_count,
        P_ENTRY_COUNT             => :p_entry_count,
        P_RESULT_COUNT            => :p_result_count,
        P_TRANSACTION_COUNT       => :p_transaction_count,
        P_STATUS                  => :p_status,
        P_SUCCESS                 => :p_success,
        P_MESSAGE                 => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_stop_on_error: ynBind(payload.stop_on_error, 'N'),
    p_processed_by: stringBind(payload.processed_by, 100),
    ...outNumber('p_employee_success_count'),
    ...outNumber('p_employee_skipped_count'),
    ...outNumber('p_employee_error_count'),
    ...outNumber('p_entry_count'),
    ...outNumber('p_result_count'),
    ...outNumber('p_transaction_count'),
    ...outString('p_status', 80),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to process the payroll run.',
    mapOut: (out, helpers) => ({
      employee_success_count: helpers.num('p_employee_success_count'),
      employee_skipped_count: helpers.num('p_employee_skipped_count'),
      employee_error_count: helpers.num('p_employee_error_count'),
      entry_count: helpers.num('p_entry_count'),
      result_count: helpers.num('p_result_count'),
      transaction_count: helpers.num('p_transaction_count'),
      status: helpers.str('p_status')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id: number, retry_reason: string, retried_by: string }} payload
 */
export async function retryEmployee(payload) {
  const plsql = `
    BEGIN
      ${PKG}.RETRY_EMPLOYEE(
        P_ENTERPRISE_ID              => :p_enterprise_id,
        P_RUN_ID                     => :p_run_id,
        P_EMPLOYEE_ID                => :p_employee_id,
        P_RETRY_REASON               => :p_retry_reason,
        P_RETRIED_BY                 => :p_retried_by,
        P_REVERSED_RESULT_COUNT      => :p_reversed_result_count,
        P_REVERSED_TRANSACTION_COUNT => :p_reversed_transaction_count,
        P_ENTRY_COUNT                => :p_entry_count,
        P_RESULT_COUNT               => :p_result_count,
        P_TRANSACTION_COUNT          => :p_transaction_count,
        P_STATUS                     => :p_status,
        P_SUCCESS                    => :p_success,
        P_MESSAGE                    => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_employee_id: numberBind(payload.employee_id),
    p_retry_reason: stringBind(payload.retry_reason, 500),
    p_retried_by: stringBind(payload.retried_by, 100),
    ...outNumber('p_reversed_result_count'),
    ...outNumber('p_reversed_transaction_count'),
    ...outNumber('p_entry_count'),
    ...outNumber('p_result_count'),
    ...outNumber('p_transaction_count'),
    ...outString('p_status', 80),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to retry this employee.',
    mapOut: (out, helpers) => ({
      reversed_result_count: helpers.num('p_reversed_result_count'),
      reversed_transaction_count: helpers.num('p_reversed_transaction_count'),
      entry_count: helpers.num('p_entry_count'),
      result_count: helpers.num('p_result_count'),
      transaction_count: helpers.num('p_transaction_count'),
      status: helpers.str('p_status')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, rollback_reason: string, rolled_back_by: string }} payload
 */
export async function rollbackRun(payload) {
  const plsql = `
    BEGIN
      ${PKG}.ROLLBACK_RUN(
        P_ENTERPRISE_ID                    => :p_enterprise_id,
        P_RUN_ID                           => :p_run_id,
        P_ROLLBACK_REASON                  => :p_rollback_reason,
        P_ROLLED_BACK_BY                   => :p_rolled_back_by,
        P_REVERSED_RESULT_COUNT            => :p_reversed_result_count,
        P_REVERSED_TRANSACTION_COUNT       => :p_reversed_transaction_count,
        P_REVERSED_BALANCE_RESULT_COUNT    => :p_reversed_balance_result_count,
        P_RESET_ENTRY_COUNT                => :p_reset_entry_count,
        P_ROLLED_BACK_ACTION_COUNT         => :p_rolled_back_action_count,
        P_STATUS                           => :p_status,
        P_SUCCESS                          => :p_success,
        P_MESSAGE                          => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_rollback_reason: stringBind(payload.rollback_reason, 500),
    p_rolled_back_by: stringBind(payload.rolled_back_by, 100),
    ...outNumber('p_reversed_result_count'),
    ...outNumber('p_reversed_transaction_count'),
    ...outNumber('p_reversed_balance_result_count'),
    ...outNumber('p_reset_entry_count'),
    ...outNumber('p_rolled_back_action_count'),
    ...outString('p_status', 80),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to roll back this payroll run.',
    mapOut: (out, helpers) => ({
      reversed_result_count: helpers.num('p_reversed_result_count'),
      reversed_transaction_count: helpers.num('p_reversed_transaction_count'),
      reversed_balance_result_count: helpers.num('p_reversed_balance_result_count'),
      reset_entry_count: helpers.num('p_reset_entry_count'),
      rolled_back_action_count: helpers.num('p_rolled_back_action_count'),
      status: helpers.str('p_status')
    })
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, finalized_by: string }} payload
 */
export async function finalizeRun(payload) {
  const plsql = `
    BEGIN
      ${PKG}.FINALIZE_RUN(
        P_ENTERPRISE_ID       => :p_enterprise_id,
        P_RUN_ID              => :p_run_id,
        P_FINALIZED_BY        => :p_finalized_by,
        P_SOURCE_TOTAL        => :p_source_total,
        P_RESULT_TOTAL        => :p_result_total,
        P_BALANCE_RESULT_COUNT => :p_balance_result_count,
        P_STATUS              => :p_status,
        P_SUCCESS             => :p_success,
        P_MESSAGE             => :p_message
      );
    END;`;

  const binds = {
    p_enterprise_id: numberBind(payload.enterprise_id),
    p_run_id: numberBind(payload.run_id),
    p_finalized_by: stringBind(payload.finalized_by, 100),
    ...outNumber('p_source_total'),
    ...outNumber('p_result_total'),
    ...outNumber('p_balance_result_count'),
    ...outString('p_status', 80),
    ...successAndMessageOut()
  };

  return executePayrollPackage(plsql, binds, {
    genericError: 'Unable to finalize this payroll run.',
    mapOut: (out, helpers) => ({
      source_total: helpers.num('p_source_total'),
      result_total: helpers.num('p_result_total'),
      balance_result_count: helpers.num('p_balance_result_count'),
      status: helpers.str('p_status')
    })
  });
}

/**
 * No RETRY_RUN procedure exists on PAY.PAYROLL_PROCESSING_PKG. A run-level
 * retry is implemented as PROCESS_RUN with P_STOP_ON_ERROR = 'N': the package
 * re-processes only employees left in a pending/failed state, leaving
 * already-succeeded employees untouched.
 * @param {{ enterprise_id: number, run_id: number, processed_by: string }} payload
 */
export async function retryRun(payload) {
  return processRun({ ...payload, stop_on_error: 'N' });
}
