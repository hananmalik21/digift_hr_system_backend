/**
 * Payroll audit trail reads.
 * Views: PAY.V_PAY_PAYMENT_STATUS_HISTORY, PAY.V_PAY_GL_JOURNAL_STATUS_HISTORY,
 *        PAY.V_PAY_PAYROLL_CLOSE_HISTORY, PAY.V_PAY_APPROVAL_ACTIONS,
 *        PAY.V_PAY_STATUTORY_AUDIT, PAY.V_PAY_OPERATION_EVENTS.
 */
import { queryPayList, queryPayMany } from '../../shared/index.js';

const ACTION_DATE_OPTS = { dateTimes: ['ACTION_DATE'] };
const EVENT_DATE_OPTS = { dateTimes: ['EVENT_DATE'] };

/** GET /audit/payment-history */
export async function listPaymentHistory(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_PAYMENT_STATUS_HISTORY v',
    filters: [
      { sql: 'v.PAYMENT_BATCH_ID = :payment_batch_id', bind: 'payment_batch_id', value: filters.payment_batch_id },
      { sql: 'v.PAYMENT_ID = :payment_id', bind: 'payment_id', value: filters.payment_id },
      { sql: 'v.ACTION_CODE = UPPER(:action_code)', bind: 'action_code', value: filters.action_code },
      { sql: 'v.NEW_STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code },
      { sql: 'v.ACTION_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.ACTION_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: ACTION_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/** GET /audit/gl-history */
export async function listGlHistory(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_GL_JOURNAL_STATUS_HISTORY v',
    filters: [
      { sql: 'v.GL_JOURNAL_BATCH_ID = :gl_journal_batch_id', bind: 'gl_journal_batch_id', value: filters.gl_journal_batch_id },
      { sql: 'v.ACTION_CODE = UPPER(:action_code)', bind: 'action_code', value: filters.action_code },
      { sql: 'v.NEW_STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code },
      { sql: 'v.ACTION_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.ACTION_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: ACTION_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/** GET /audit/payroll-close-history */
export async function listPayrollCloseHistory(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_PAYROLL_CLOSE_HISTORY v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.ACTION_CODE = UPPER(:action_code)', bind: 'action_code', value: filters.action_code },
      { sql: 'v.NEW_STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code },
      { sql: 'v.ACTION_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.ACTION_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: ACTION_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/** GET /audit/approval-actions */
export async function listApprovalActions(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_APPROVAL_ACTIONS v',
    filters: [
      { sql: 'v.APPROVAL_REQUEST_ID = :approval_request_id', bind: 'approval_request_id', value: filters.approval_request_id },
      { sql: 'v.OBJECT_TYPE_CODE = UPPER(:object_type_code)', bind: 'object_type_code', value: filters.object_type_code },
      { sql: 'v.OBJECT_ID = :object_id', bind: 'object_id', value: filters.object_id },
      { sql: 'v.ACTION_CODE = UPPER(:action_code)', bind: 'action_code', value: filters.action_code },
      { sql: 'v.ACTION_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.ACTION_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: ACTION_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/** GET /audit/statutory-history */
export async function listStatutoryAudit(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_STATUTORY_AUDIT v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.OBJECT_TYPE_CODE = UPPER(:object_type_code)', bind: 'object_type_code', value: filters.object_type_code },
      { sql: 'v.OBJECT_ID = :object_id', bind: 'object_id', value: filters.object_id },
      { sql: 'v.ACTION_CODE = UPPER(:action_code)', bind: 'action_code', value: filters.action_code },
      { sql: 'v.ACTION_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.ACTION_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: ACTION_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/** GET /audit/operation-events */
export async function listOperationEvents(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_OPERATION_EVENTS v',
    filters: [
      { sql: 'v.OPERATION_RUN_ID = :operation_run_id', bind: 'operation_run_id', value: filters.operation_run_id },
      { sql: 'v.EVENT_TYPE_CODE = UPPER(:event_type_code)', bind: 'event_type_code', value: filters.event_type_code },
      { sql: 'v.NEW_STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code },
      { sql: 'v.EVENT_DATE >= TO_DATE(:date_from, \'YYYY-MM-DD\')', bind: 'date_from', value: filters.date_from },
      { sql: 'v.EVENT_DATE < TO_DATE(:date_to, \'YYYY-MM-DD\') + 1', bind: 'date_to', value: filters.date_to }
    ],
    defaultSort: 'v.EVENT_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: EVENT_DATE_OPTS,
    logTag: 'payAudit'
  });
}

/**
 * GET /audit/run/:runId — combined audit trail for a single payroll run.
 * @param {number} runId
 */
export async function getRunAuditTrail(runId) {
  const [
    payrollCloseHistory,
    paymentHistory,
    glHistory,
    approvalActions,
    statutoryAudit,
    operationEvents,
    healthCheckResults,
    certifications
  ] = await Promise.all([
    queryPayMany({
      fromSql: 'PAY.V_PAY_PAYROLL_CLOSE_HISTORY v',
      filters: [{ sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.ACTION_DATE DESC',
      maxRows: 200,
      mapOptions: ACTION_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_PAYMENT_STATUS_HISTORY v JOIN PAY.V_PAY_PAYMENT_BATCHES pb ON pb.PAYMENT_BATCH_ID = v.PAYMENT_BATCH_ID',
      selectSql: 'v.*',
      alias: 'v',
      filters: [{ sql: 'pb.RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.ACTION_DATE DESC',
      maxRows: 200,
      mapOptions: ACTION_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_GL_JOURNAL_STATUS_HISTORY v JOIN PAY.V_PAY_GL_JOURNAL_BATCHES gb ON gb.GL_JOURNAL_BATCH_ID = v.GL_JOURNAL_BATCH_ID',
      selectSql: 'v.*',
      alias: 'v',
      filters: [{ sql: 'gb.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.ACTION_DATE DESC',
      maxRows: 200,
      mapOptions: ACTION_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_APPROVAL_ACTIONS v',
      filters: [{ sql: 'v.OBJECT_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.ACTION_DATE DESC',
      maxRows: 200,
      mapOptions: ACTION_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_STATUTORY_AUDIT v',
      filters: [{ sql: 'v.OBJECT_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.ACTION_DATE DESC',
      maxRows: 200,
      mapOptions: ACTION_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_OPERATION_EVENTS v',
      filters: [{ sql: 'v.OPERATION_RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.EVENT_DATE DESC',
      maxRows: 200,
      mapOptions: EVENT_DATE_OPTS,
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_HEALTH_CHECK_RESULTS v',
      filters: [{ sql: 'v.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.CHECKED_DATE DESC',
      maxRows: 200,
      mapOptions: { dateTimes: ['CHECKED_DATE'] },
      logTag: 'payAudit'
    }),
    queryPayMany({
      fromSql: 'PAY.V_PAY_PROD_CERTIFICATIONS v',
      filters: [{ sql: 'v.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: runId }],
      orderBy: 'v.CERTIFIED_DATE DESC',
      maxRows: 200,
      mapOptions: { dateTimes: ['CERTIFIED_DATE'] },
      logTag: 'payAudit'
    })
  ]);

  return {
    run_id: runId,
    payroll_close_history: payrollCloseHistory,
    payment_history: paymentHistory,
    gl_history: glHistory,
    approval_actions: approvalActions,
    statutory_audit: statutoryAudit,
    operation_events: operationEvents,
    health_check_results: healthCheckResults,
    certifications
  };
}
