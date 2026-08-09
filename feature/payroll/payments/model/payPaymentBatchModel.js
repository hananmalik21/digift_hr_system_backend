/**
 * Data access for payroll payment batches, employee payments, and payment
 * status history. Reads go through PAY views; mutations go through
 * PAY.PAY_PAYMENT_PROCESSING_PKG (all batch-level).
 */

import oracledb from 'oracledb';
import {
  executePayrollPackage,
  numberBind,
  stringBind,
  outNumber,
  outGuid,
  successOutBinds,
  queryPayList,
  queryPayOne
} from '../../shared/index.js';
import { withPayViewConnection, logPayViewOracleError } from '../../../pay/utils/payViewModelUtils.js';

const BATCH_FROM = 'PAY.V_PAY_PAYMENT_BATCHES v';
const PAYMENT_FROM = 'PAY.V_PAY_EMPLOYEE_PAYMENTS v';
const HISTORY_FROM = 'PAY.V_PAY_PAYMENT_STATUS_HISTORY v';

const BATCH_SORT = {
  batch_number: 'v.BATCH_NUMBER',
  payment_date: 'v.PAYMENT_DATE',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

const PAYMENT_SORT = {
  payment_number: 'v.PAYMENT_NUMBER',
  status_code: 'v.STATUS_CODE',
  payment_amount: 'v.PAYMENT_AMOUNT',
  creation_date: 'v.CREATION_DATE'
};

export function listPaymentBatches({ enterpriseId, page, pageSize, statusCode, runId, sortBy, sortOrder, search }) {
  return queryPayList({
    fromSql: BATCH_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }
    ],
    search: { columns: ['v.BATCH_NUMBER', 'v.RUN_NUMBER'], value: search },
    allowedSort: BATCH_SORT,
    defaultSort: 'v.CREATION_DATE DESC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payPaymentBatches'
  });
}

export function getPaymentBatchById(enterpriseId, paymentBatchId) {
  return queryPayOne({
    fromSql: BATCH_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.PAYMENT_BATCH_ID = :payment_batch_id', bind: 'payment_batch_id', value: paymentBatchId }
    ],
    logTag: 'payPaymentBatches'
  });
}

export function listBatchPayments({ enterpriseId, paymentBatchId, page, pageSize, statusCode, sortBy, sortOrder, search }) {
  return queryPayList({
    fromSql: PAYMENT_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.PAYMENT_BATCH_ID = :payment_batch_id', bind: 'payment_batch_id', value: paymentBatchId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode }
    ],
    search: { columns: ['v.PAYMENT_NUMBER', 'v.EXTERNAL_REFERENCE'], value: search },
    allowedSort: PAYMENT_SORT,
    defaultSort: 'v.CREATION_DATE DESC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payEmployeePayments'
  });
}

export function getPaymentById(enterpriseId, paymentId) {
  return queryPayOne({
    fromSql: PAYMENT_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.PAYMENT_ID = :payment_id', bind: 'payment_id', value: paymentId }
    ],
    logTag: 'payEmployeePayments'
  });
}

/**
 * Payment status history has no ENTERPRISE_ID column, so callers must first
 * confirm the batch belongs to the acting enterprise (see getPaymentBatchById)
 * before calling this.
 */
export function getBatchHistory({ paymentBatchId, page, pageSize }) {
  return queryPayList({
    fromSql: HISTORY_FROM,
    filters: [{ sql: 'v.PAYMENT_BATCH_ID = :payment_batch_id', bind: 'payment_batch_id', value: paymentBatchId }],
    defaultSort: 'v.ACTION_DATE DESC',
    page,
    pageSize,
    logTag: 'payPaymentStatusHistory'
  });
}

/**
 * Aggregate reconciliation snapshot for a batch, built from the employee
 * payments view (no dedicated reconciliation view exists for payments).
 */
export async function getBatchReconciliationBreakdown(paymentBatchId) {
  const sql = `
    SELECT STATUS_CODE, RECONCILIATION_STATUS_CODE,
           COUNT(*) AS PAYMENT_COUNT,
           SUM(PAYMENT_AMOUNT) AS TOTAL_AMOUNT
    FROM PAY.V_PAY_EMPLOYEE_PAYMENTS
    WHERE PAYMENT_BATCH_ID = :payment_batch_id
    GROUP BY STATUS_CODE, RECONCILIATION_STATUS_CODE
    ORDER BY STATUS_CODE, RECONCILIATION_STATUS_CODE
  `;
  return withPayViewConnection(async (connection) => {
    try {
      const result = await connection.execute(
        sql,
        { payment_batch_id: paymentBatchId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      return (result.rows || []).map((row) => ({
        status_code: row.STATUS_CODE,
        reconciliation_status_code: row.RECONCILIATION_STATUS_CODE,
        payment_count: Number(row.PAYMENT_COUNT || 0),
        total_amount: Number(row.TOTAL_AMOUNT || 0)
      }));
    } catch (err) {
      logPayViewOracleError('payPaymentReconciliation', 'breakdown', err);
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// PAY.PAY_PAYMENT_PROCESSING_PKG — all mutations are batch-level.
// ---------------------------------------------------------------------------

export async function createPaymentBatch({ enterpriseId, runId, createdBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.CREATE_BATCH(
        P_ENTERPRISE_ID      => :p_enterprise_id,
        P_RUN_ID             => :p_run_id,
        P_CREATED_BY         => :p_created_by,
        P_PAYMENT_BATCH_ID   => :p_payment_batch_id,
        P_PAYMENT_BATCH_GUID => :p_payment_batch_guid,
        P_PAYMENT_COUNT      => :p_payment_count,
        P_TOTAL_AMOUNT       => :p_total_amount,
        P_SUCCESS            => :p_success,
        P_MESSAGE            => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_created_by: stringBind(createdBy, 100),
    ...outNumber('p_payment_batch_id'),
    ...outGuid('p_payment_batch_guid'),
    ...outNumber('p_payment_count'),
    ...outNumber('p_total_amount'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      payment_batch_id: h.num('p_payment_batch_id'),
      payment_batch_guid: h.guid('p_payment_batch_guid'),
      payment_count: h.num('p_payment_count'),
      total_amount: h.num('p_total_amount')
    })
  });
}

export async function validatePaymentBatch({ enterpriseId, paymentBatchId, validatedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.VALIDATE_BATCH(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_VALIDATED_BY     => :p_validated_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_validated_by: stringBind(validatedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function markBatchReady({ enterpriseId, paymentBatchId, readyBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.MARK_READY(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_READY_BY         => :p_ready_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_ready_by: stringBind(readyBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function issuePaymentBatch({ enterpriseId, paymentBatchId, issueReference, fundingReference, issuedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.ISSUE_BATCH(
        P_ENTERPRISE_ID     => :p_enterprise_id,
        P_PAYMENT_BATCH_ID  => :p_payment_batch_id,
        P_ISSUE_REFERENCE   => :p_issue_reference,
        P_FUNDING_REFERENCE => :p_funding_reference,
        P_ISSUED_BY         => :p_issued_by,
        P_SUCCESS           => :p_success,
        P_MESSAGE           => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_issue_reference: stringBind(issueReference, 200),
    p_funding_reference: stringBind(fundingReference, 200),
    p_issued_by: stringBind(issuedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function clearPaymentBatch({ enterpriseId, paymentBatchId, bankReference, clearedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.CLEAR_BATCH(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_BANK_REFERENCE   => :p_bank_reference,
        P_CLEARED_BY       => :p_cleared_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_bank_reference: stringBind(bankReference, 200),
    p_cleared_by: stringBind(clearedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function rejectPaymentBatch({ enterpriseId, paymentBatchId, reason, rejectedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.REJECT_BATCH(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_REASON           => :p_reason,
        P_REJECTED_BY      => :p_rejected_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_reason: stringBind(reason, 4000),
    p_rejected_by: stringBind(rejectedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function voidPaymentBatch({ enterpriseId, paymentBatchId, reason, voidedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.VOID_BATCH(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_REASON           => :p_reason,
        P_VOIDED_BY        => :p_voided_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_reason: stringBind(reason, 4000),
    p_voided_by: stringBind(voidedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function markPaymentBatchReturned({ enterpriseId, paymentBatchId, reason, returnReference, returnedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.MARK_RETURNED(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_REASON           => :p_reason,
        P_RETURN_REFERENCE => :p_return_reference,
        P_RETURNED_BY      => :p_returned_by,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_reason: stringBind(reason, 4000),
    p_return_reference: stringBind(returnReference, 200),
    p_returned_by: stringBind(returnedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function reverseClearedPaymentBatch({ enterpriseId, paymentBatchId, reason, reversalReference, reversedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYMENT_PROCESSING_PKG.REVERSE_CLEARED_BATCH(
        P_ENTERPRISE_ID      => :p_enterprise_id,
        P_PAYMENT_BATCH_ID   => :p_payment_batch_id,
        P_REASON             => :p_reason,
        P_REVERSAL_REFERENCE => :p_reversal_reference,
        P_REVERSED_BY        => :p_reversed_by,
        P_SUCCESS            => :p_success,
        P_MESSAGE            => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_reason: stringBind(reason, 4000),
    p_reversal_reference: stringBind(reversalReference, 200),
    p_reversed_by: stringBind(reversedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}
