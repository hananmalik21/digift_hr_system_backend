/**
 * Data access for GL journal batches/lines/history/exports/reconciliation.
 * Reads go through PAY views; mutations go through PAY.PAY_GL_PROCESSING_PKG.
 *
 * NOTE: V_PAY_GL_JOURNAL_LINES, V_PAY_GL_JOURNAL_STATUS_HISTORY, and
 * V_PAY_GL_EXPORTS have no ENTERPRISE_ID column, so callers must first
 * confirm the parent journal batch belongs to the acting enterprise via
 * getJournalById() before querying these by GL_JOURNAL_BATCH_ID alone.
 */

import {
  executePayrollPackage,
  numberBind,
  stringBind,
  outNumber,
  outString,
  successOutBinds,
  queryPayList,
  queryPayOne,
  queryPayMany
} from '../../shared/index.js';

const JOURNAL_FROM = 'PAY.V_PAY_GL_JOURNAL_BATCHES v';
const LINES_FROM = 'PAY.V_PAY_GL_JOURNAL_LINES v';
const HISTORY_FROM = 'PAY.V_PAY_GL_JOURNAL_STATUS_HISTORY v';
const EXPORTS_FROM = 'PAY.V_PAY_GL_EXPORTS v';
const RECON_FROM = 'PAY.V_PAY_GL_RECONCILIATIONS v';

const JOURNAL_SORT = {
  journal_number: 'v.JOURNAL_NUMBER',
  accounting_date: 'v.ACCOUNTING_DATE',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

export function listJournals({
  enterpriseId,
  page,
  pageSize,
  statusCode,
  sourceTypeCode,
  runId,
  paymentBatchId,
  sortBy,
  sortOrder,
  search
}) {
  return queryPayList({
    fromSql: JOURNAL_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.SOURCE_TYPE_CODE = :source_type_code', bind: 'source_type_code', value: sourceTypeCode },
      { sql: 'v.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: runId },
      { sql: 'v.PAYMENT_BATCH_ID = :payment_batch_id', bind: 'payment_batch_id', value: paymentBatchId }
    ],
    search: { columns: ['v.JOURNAL_NUMBER', 'v.JOURNAL_NAME'], value: search },
    allowedSort: JOURNAL_SORT,
    defaultSort: 'v.CREATION_DATE DESC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    mapOptions: { dates: ['ACCOUNTING_DATE'] },
    logTag: 'payGlJournalBatches'
  });
}

export function getJournalById(enterpriseId, journalId) {
  return queryPayOne({
    fromSql: JOURNAL_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.GL_JOURNAL_BATCH_ID = :journal_id', bind: 'journal_id', value: journalId }
    ],
    mapOptions: { dates: ['ACCOUNTING_DATE'] },
    logTag: 'payGlJournalBatches'
  });
}

export function listJournalLines({ journalId, page, pageSize, sortBy, sortOrder }) {
  return queryPayList({
    fromSql: LINES_FROM,
    filters: [{ sql: 'v.GL_JOURNAL_BATCH_ID = :journal_id', bind: 'journal_id', value: journalId }],
    allowedSort: { line_number: 'v.LINE_NUMBER' },
    defaultSort: 'v.LINE_NUMBER ASC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payGlJournalLines'
  });
}

export function getJournalHistory({ journalId, page, pageSize }) {
  return queryPayList({
    fromSql: HISTORY_FROM,
    filters: [{ sql: 'v.GL_JOURNAL_BATCH_ID = :journal_id', bind: 'journal_id', value: journalId }],
    defaultSort: 'v.ACTION_DATE DESC',
    page,
    pageSize,
    logTag: 'payGlJournalStatusHistory'
  });
}

export async function getLatestJournalExport(journalId) {
  const rows = await queryPayMany({
    fromSql: EXPORTS_FROM,
    filters: [{ sql: 'v.GL_JOURNAL_BATCH_ID = :journal_id', bind: 'journal_id', value: journalId }],
    orderBy: 'v.GL_EXPORT_ID DESC',
    maxRows: 1,
    logTag: 'payGlExports'
  });
  return rows[0] ?? null;
}

export function getRunReconciliation(enterpriseId, runId) {
  return queryPayOne({
    fromSql: RECON_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }
    ],
    logTag: 'payGlReconciliations'
  });
}

// ---------------------------------------------------------------------------
// PAY.PAY_GL_PROCESSING_PKG
// ---------------------------------------------------------------------------

export async function createAccrualJournal({ enterpriseId, runId, paymentBatchId, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.CREATE_ACCRUAL(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_RUN_ID           => :p_run_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_USER             => :p_user,
        P_JOURNAL_ID       => :p_journal_id,
        P_LINE_COUNT       => :p_line_count,
        P_DEBIT            => :p_debit,
        P_CREDIT           => :p_credit,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_user: stringBind(user, 100),
    ...outNumber('p_journal_id'),
    ...outNumber('p_line_count'),
    ...outNumber('p_debit'),
    ...outNumber('p_credit'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      journal_id: h.num('p_journal_id'),
      line_count: h.num('p_line_count'),
      debit: h.num('p_debit'),
      credit: h.num('p_credit')
    })
  });
}

export async function createSettlementJournal({ enterpriseId, paymentBatchId, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.CREATE_SETTLEMENT(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_USER             => :p_user,
        P_JOURNAL_ID       => :p_journal_id,
        P_LINE_COUNT       => :p_line_count,
        P_DEBIT            => :p_debit,
        P_CREDIT           => :p_credit,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_user: stringBind(user, 100),
    ...outNumber('p_journal_id'),
    ...outNumber('p_line_count'),
    ...outNumber('p_debit'),
    ...outNumber('p_credit'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      journal_id: h.num('p_journal_id'),
      line_count: h.num('p_line_count'),
      debit: h.num('p_debit'),
      credit: h.num('p_credit')
    })
  });
}

export async function validateJournal({ enterpriseId, journalId, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.VALIDATE_JOURNAL(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_JOURNAL_ID    => :p_journal_id,
        P_USER          => :p_user,
        P_SUCCESS       => :p_success,
        P_MESSAGE       => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_journal_id: numberBind(journalId),
    p_user: stringBind(user, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function approveJournal({ enterpriseId, journalId, reference, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.APPROVE_JOURNAL(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_JOURNAL_ID    => :p_journal_id,
        P_REFERENCE     => :p_reference,
        P_USER          => :p_user,
        P_SUCCESS       => :p_success,
        P_MESSAGE       => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_journal_id: numberBind(journalId),
    p_reference: stringBind(reference, 200),
    p_user: stringBind(user, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function exportJournal({ enterpriseId, journalId, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.EXPORT_JOURNAL(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_JOURNAL_ID       => :p_journal_id,
        P_USER             => :p_user,
        P_EXPORT_ID        => :p_export_id,
        P_EXPORT_REFERENCE => :p_export_reference,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_journal_id: numberBind(journalId),
    p_user: stringBind(user, 100),
    ...outNumber('p_export_id'),
    ...outString('p_export_reference', 200),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      export_id: h.num('p_export_id'),
      export_reference: h.str('p_export_reference')
    })
  });
}

export async function postJournal({ enterpriseId, journalId, reference, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.POST_JOURNAL(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_JOURNAL_ID    => :p_journal_id,
        P_REFERENCE     => :p_reference,
        P_USER          => :p_user,
        P_SUCCESS       => :p_success,
        P_MESSAGE       => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_journal_id: numberBind(journalId),
    p_reference: stringBind(reference, 200),
    p_user: stringBind(user, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}

export async function reverseJournal({ enterpriseId, journalId, reason, reference, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.REVERSE_JOURNAL(
        P_ENTERPRISE_ID => :p_enterprise_id,
        P_JOURNAL_ID    => :p_journal_id,
        P_REASON        => :p_reason,
        P_REFERENCE     => :p_reference,
        P_USER          => :p_user,
        P_REVERSAL_ID   => :p_reversal_id,
        P_SUCCESS       => :p_success,
        P_MESSAGE       => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_journal_id: numberBind(journalId),
    p_reason: stringBind(reason, 4000),
    p_reference: stringBind(reference, 200),
    p_user: stringBind(user, 100),
    ...outNumber('p_reversal_id'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({ reversal_id: h.num('p_reversal_id') })
  });
}

export async function reconcile({ enterpriseId, runId, paymentBatchId, accrualId, settlementId, user }) {
  const plsql = `
    BEGIN
      PAY.PAY_GL_PROCESSING_PKG.RECONCILE(
        P_ENTERPRISE_ID    => :p_enterprise_id,
        P_RUN_ID           => :p_run_id,
        P_PAYMENT_BATCH_ID => :p_payment_batch_id,
        P_ACCRUAL_ID       => :p_accrual_id,
        P_SETTLEMENT_ID    => :p_settlement_id,
        P_USER             => :p_user,
        P_RECON_ID         => :p_recon_id,
        P_STATUS           => :p_status,
        P_SUCCESS          => :p_success,
        P_MESSAGE          => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_payment_batch_id: numberBind(paymentBatchId),
    p_accrual_id: numberBind(accrualId),
    p_settlement_id: numberBind(settlementId),
    p_user: stringBind(user, 100),
    ...outNumber('p_recon_id'),
    ...outString('p_status', 80),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      recon_id: h.num('p_recon_id'),
      status: h.str('p_status')
    })
  });
}
