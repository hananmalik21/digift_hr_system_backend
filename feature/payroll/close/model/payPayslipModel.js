/**
 * Data access for payslips + payslip lines.
 * Reads go through PAY views; mutations go through
 * PAY.PAY_PAYROLL_CLOSE_PKG.GENERATE_PAYSLIPS / PUBLISH_PAYSLIPS (both run-level).
 *
 * NOTE: V_PAY_PAYSLIP_LINES has no ENTERPRISE_ID column, so callers must
 * first confirm the parent payslip belongs to the acting enterprise via
 * getPayslipById() before querying lines by PAYSLIP_ID alone.
 */

import {
  executePayrollPackage,
  numberBind,
  stringBind,
  outNumber,
  successOutBinds,
  queryPayList,
  queryPayOne
} from '../../shared/index.js';

const PAYSLIP_FROM = 'PAY.V_PAY_PAYSLIPS v';
const LINES_FROM = 'PAY.V_PAY_PAYSLIP_LINES v';

const PAYSLIP_SORT = {
  payslip_number: 'v.PAYSLIP_NUMBER',
  payment_date: 'v.PAYMENT_DATE',
  net_pay: 'v.NET_PAY',
  status_code: 'v.STATUS_CODE',
  creation_date: 'v.CREATION_DATE'
};

export function listPayslips({
  enterpriseId,
  page,
  pageSize,
  runId,
  employeeId,
  statusCode,
  paymentStatusCode,
  sortBy,
  sortOrder,
  search
}) {
  return queryPayList({
    fromSql: PAYSLIP_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: employeeId },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: statusCode },
      { sql: 'v.PAYMENT_STATUS_CODE = :payment_status_code', bind: 'payment_status_code', value: paymentStatusCode }
    ],
    search: { columns: ['v.PAYSLIP_NUMBER'], value: search },
    allowedSort: PAYSLIP_SORT,
    defaultSort: 'v.CREATION_DATE DESC',
    sortBy,
    sortOrder,
    page,
    pageSize,
    logTag: 'payPayslips'
  });
}

export function getPayslipById(enterpriseId, payslipId) {
  return queryPayOne({
    fromSql: PAYSLIP_FROM,
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.PAYSLIP_ID = :payslip_id', bind: 'payslip_id', value: payslipId }
    ],
    logTag: 'payPayslips'
  });
}

export function listPayslipLines({ payslipId, page, pageSize }) {
  return queryPayList({
    fromSql: LINES_FROM,
    filters: [{ sql: 'v.PAYSLIP_ID = :payslip_id', bind: 'payslip_id', value: payslipId }],
    defaultSort: 'v.LINE_SEQUENCE ASC',
    page,
    pageSize,
    logTag: 'payPayslipLines'
  });
}

export function listEmployeePayslips({ enterpriseId, employeeId, page, pageSize, sortBy, sortOrder }) {
  return listPayslips({ enterpriseId, employeeId, page, pageSize, sortBy, sortOrder });
}

// ---------------------------------------------------------------------------
// PAY.PAY_PAYROLL_CLOSE_PKG — payslip generation/publish are run-level only.
// ---------------------------------------------------------------------------

export async function generatePayslips({ enterpriseId, runId, generatedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYROLL_CLOSE_PKG.GENERATE_PAYSLIPS(
        P_ENTERPRISE_ID     => :p_enterprise_id,
        P_RUN_ID            => :p_run_id,
        P_GENERATED_BY      => :p_generated_by,
        P_PAYSLIP_COUNT     => :p_payslip_count,
        P_TOTAL_GROSS       => :p_total_gross,
        P_TOTAL_DEDUCTIONS  => :p_total_deductions,
        P_TOTAL_NET         => :p_total_net,
        P_SUCCESS           => :p_success,
        P_MESSAGE           => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_generated_by: stringBind(generatedBy, 100),
    ...outNumber('p_payslip_count'),
    ...outNumber('p_total_gross'),
    ...outNumber('p_total_deductions'),
    ...outNumber('p_total_net'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({
      payslip_count: h.num('p_payslip_count'),
      total_gross: h.num('p_total_gross'),
      total_deductions: h.num('p_total_deductions'),
      total_net: h.num('p_total_net')
    })
  });
}

export async function publishPayslips({ enterpriseId, runId, publishedBy }) {
  const plsql = `
    BEGIN
      PAY.PAY_PAYROLL_CLOSE_PKG.PUBLISH_PAYSLIPS(
        P_ENTERPRISE_ID   => :p_enterprise_id,
        P_RUN_ID          => :p_run_id,
        P_PUBLISHED_BY    => :p_published_by,
        P_PUBLISHED_COUNT => :p_published_count,
        P_SUCCESS         => :p_success,
        P_MESSAGE         => :p_message
      );
    END;
  `;
  const binds = {
    p_enterprise_id: numberBind(enterpriseId),
    p_run_id: numberBind(runId),
    p_published_by: stringBind(publishedBy, 100),
    ...outNumber('p_published_count'),
    ...successOutBinds('p')
  };
  return executePayrollPackage(plsql, binds, {
    mapOut: (out, h) => ({ published_count: h.num('p_published_count') })
  });
}
