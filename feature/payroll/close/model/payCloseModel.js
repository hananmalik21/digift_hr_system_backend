/**
 * Data access for payroll period close: validation checks, close/reopen,
 * and close history. All mutations go through PAY.PAY_PAYROLL_CLOSE_PKG.
 */

import {
  executePayrollPackage,
  numberBind,
  stringBind,
  outNumber,
  successOutBinds,
  queryPayList
} from '../../shared/index.js';

const CHECKS_FROM = 'PAY.V_PAY_PAYROLL_CLOSE_CHECKS v';
const HISTORY_FROM = 'PAY.V_PAY_PAYROLL_CLOSE_HISTORY v';

export function listCloseChecks({ enterpriseId, runId, page, pageSize }) {
  return queryPayList({
    fromSql: CHECKS_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }
    ],
    defaultSort: 'v.CHECK_SEQUENCE ASC',
    page,
    pageSize,
    logTag: 'payPayrollCloseChecks'
  });
}

export function listCloseHistory({ enterpriseId, runId, page, pageSize }) {
  return queryPayList({
    fromSql: HISTORY_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }
    ],
    defaultSort: 'v.ACTION_DATE DESC',
    page,
    pageSize,
    logTag: 'payPayrollCloseHistory'
  });
}

// ---------------------------------------------------------------------------
// PAY.PAY_PAYROLL_CLOSE_PKG
// ---------------------------------------------------------------------------

export async function validateAndClose({ enterpriseId, runId, closeReference, closedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYROLL_CLOSE_PKG.VALIDATE_AND_CLOSE(
        P_ENTERPRISE_ID   => :p_enterprise_id,
        P_RUN_ID          => :p_run_id,
        P_CLOSE_REFERENCE => :p_close_reference,
        P_CLOSED_BY       => :p_closed_by,
        P_PASS_COUNT      => :p_pass_count,
        P_FAIL_COUNT      => :p_fail_count,
        P_SUCCESS         => :p_success,
        P_MESSAGE         => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_close_reference: stringBind(closeReference, 200),
    p_closed_by: stringBind(closedBy, 100),
    ...outNumber('p_pass_count'),
    ...outNumber('p_fail_count'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      pass_count: h.num('p_pass_count'),
      fail_count: h.num('p_fail_count')
    })
  });
}

export async function reopenRun({ enterpriseId, runId, reason, approvalReference, reopenedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYROLL_CLOSE_PKG.REOPEN_RUN(
        P_ENTERPRISE_ID      => :p_enterprise_id,
        P_RUN_ID             => :p_run_id,
        P_REASON             => :p_reason,
        P_APPROVAL_REFERENCE => :p_approval_reference,
        P_REOPENED_BY        => :p_reopened_by,
        P_SUCCESS            => :p_success,
        P_MESSAGE            => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_reason: stringBind(reason, 4000),
    p_approval_reference: stringBind(approvalReference, 200),
    p_reopened_by: stringBind(reopenedBy, 100),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, { mapOut: () => ({}) });
}
