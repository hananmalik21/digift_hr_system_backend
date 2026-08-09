/**
 * Payroll operations dashboard aggregations.
 * Sources: PAY.PAYROLL_RUNS, PAY.V_PAY_PAYMENT_BATCHES, PAY.V_PAY_GL_JOURNAL_BATCHES,
 *          PAY.V_PAY_PAYSLIPS, PAY.V_PAY_APPROVAL_REQUESTS, PAY.V_PAY_STATUTORY_FILINGS,
 *          PAY.PAY_HEALTH_CHECK_RUNS, PAY.V_PAY_PROD_CERTIFICATIONS.
 */
import oracledb from 'oracledb';
import { queryPayList } from '../../shared/index.js';
import { withPayViewConnection } from '../../../pay/utils/payViewModelUtils.js';

function buildCommonRunFilters(filters, alias) {
  const out = [];
  if (filters.enterprise_id != null) out.push({ sql: `${alias}.ENTERPRISE_ID = :enterprise_id`, bind: 'enterprise_id', value: filters.enterprise_id });
  if (filters.payroll_id != null) out.push({ sql: `${alias}.PAYROLL_ID = :payroll_id`, bind: 'payroll_id', value: filters.payroll_id });
  return out;
}

const RUN_MAP_OPTIONS = {
  dates: ['PERIOD_START_DATE', 'PERIOD_END_DATE', 'PAYMENT_DATE'],
  dateTimes: [
    'STARTED_DATE', 'COMPLETED_DATE', 'ROLLED_BACK_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE',
    'PAYMENT_ISSUED_DATE', 'PAYMENT_CLEARED_DATE', 'PERIOD_CLOSED_DATE'
  ]
};

/** GET /dashboard/runs */
export async function listDashboardRuns(filters) {
  return queryPayList({
    fromSql: 'PAY.PAYROLL_RUNS r',
    alias: 'r',
    filters: [
      ...buildCommonRunFilters(filters, 'r'),
      { sql: 'r.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'r.STATUS_CODE = UPPER(:status)', bind: 'status', value: filters.status },
      { sql: 'r.PAYMENT_STATUS_CODE = UPPER(:payment_status)', bind: 'payment_status', value: filters.payment_status },
      { sql: 'r.GL_STATUS_CODE = UPPER(:gl_status)', bind: 'gl_status', value: filters.gl_status },
      { sql: 'r.PERIOD_START_DATE >= TO_DATE(:period_start_date, \'YYYY-MM-DD\')', bind: 'period_start_date', value: filters.period_start_date },
      { sql: 'r.PERIOD_END_DATE <= TO_DATE(:period_end_date, \'YYYY-MM-DD\')', bind: 'period_end_date', value: filters.period_end_date }
    ],
    defaultSort: 'r.PERIOD_START_DATE DESC',
    allowedSort: { period_start: 'r.PERIOD_START_DATE', run_number: 'r.RUN_NUMBER', creation_date: 'r.CREATION_DATE' },
    sortBy: filters.sort_by,
    sortOrder: filters.sort_order,
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: RUN_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

/** GET /dashboard/exceptions — runs with employee errors or an error status */
export async function listDashboardExceptions(filters) {
  return queryPayList({
    fromSql: 'PAY.PAYROLL_RUNS r',
    alias: 'r',
    filters: [
      ...buildCommonRunFilters(filters, 'r'),
      { sql: 'r.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      {
        sql: "(r.ERROR_EMPLOYEES > 0 OR r.ERROR_CODE IS NOT NULL OR r.STATUS_CODE = 'ERROR')",
        skipIfEmpty: false
      },
      { sql: 'r.PERIOD_START_DATE >= TO_DATE(:period_start_date, \'YYYY-MM-DD\')', bind: 'period_start_date', value: filters.period_start_date },
      { sql: 'r.PERIOD_END_DATE <= TO_DATE(:period_end_date, \'YYYY-MM-DD\')', bind: 'period_end_date', value: filters.period_end_date }
    ],
    defaultSort: 'r.PERIOD_START_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: RUN_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

const APPROVAL_MAP_OPTIONS = {
  dateTimes: ['REQUESTED_DATE', 'APPROVED_DATE', 'REJECTED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** GET /dashboard/pending-approvals */
export async function listPendingApprovals(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_APPROVAL_REQUESTS v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: "v.STATUS_CODE = NVL(UPPER(:status), 'PENDING')", bind: 'status', value: filters.status ?? 'PENDING', skipIfEmpty: false },
      { sql: 'v.OBJECT_TYPE_CODE = UPPER(:object_type_code)', bind: 'object_type_code', value: filters.object_type_code }
    ],
    defaultSort: 'v.REQUESTED_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: APPROVAL_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

const PAYMENT_MAP_OPTIONS = {
  dates: ['PAYMENT_DATE', 'ISSUE_DATE', 'CLEARED_DATE'],
  dateTimes: ['CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** GET /dashboard/payment-status */
export async function listPaymentStatus(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_PAYMENT_BATCHES v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payroll_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.STATUS_CODE = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.PAYMENT_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: PAYMENT_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

const GL_MAP_OPTIONS = {
  dates: ['ACCOUNTING_DATE'],
  dateTimes: ['APPROVED_DATE', 'EXPORTED_DATE', 'POSTED_DATE', 'REVERSED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** GET /dashboard/gl-status */
export async function listGlStatus(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_GL_JOURNAL_BATCHES v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.STATUS_CODE = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.ACCOUNTING_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: GL_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

const STATUTORY_MAP_OPTIONS = {
  dates: ['PERIOD_START_DATE', 'PERIOD_END_DATE'],
  dateTimes: ['VALIDATED_DATE', 'FILED_DATE', 'ACCEPTED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** GET /dashboard/statutory-status */
export async function listStatutoryStatus(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_STATUTORY_FILINGS v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.STATUS_CODE = UPPER(:status)', bind: 'status', value: filters.status },
      { sql: 'v.TAX_YEAR = :tax_year', bind: 'tax_year', value: filters.tax_year }
    ],
    defaultSort: 'v.PERIOD_START_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: STATUTORY_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

const CERT_MAP_OPTIONS = {
  dateTimes: ['CERTIFIED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/** GET /dashboard/certification-status */
export async function listCertificationStatus(filters) {
  return queryPayList({
    fromSql: 'PAY.V_PAY_PROD_CERTIFICATIONS v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.SOURCE_RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.STATUS_CODE = UPPER(:status)', bind: 'status', value: filters.status }
    ],
    defaultSort: 'v.CERTIFIED_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: CERT_MAP_OPTIONS,
    logTag: 'payDashboard'
  });
}

function groupCounts(rows, key = 'GROUP_KEY') {
  return rows.map((r) => ({ status: r[key], count: Number(r.CNT || 0) }));
}

/**
 * GET /dashboard/summary
 * @param {{ enterprise_id: number, payroll_id?, run_id?, period_start_date?, period_end_date? }} filters
 */
export async function getDashboardSummary(filters) {
  return withPayViewConnection(async (connection) => {
    const opts = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const runBinds = {
      enterprise_id: filters.enterprise_id,
      payroll_id: filters.payroll_id ?? null,
      run_id: filters.run_id ?? null,
      period_start_date: filters.period_start_date ?? null,
      period_end_date: filters.period_end_date ?? null
    };
    const enterpriseRunBinds = {
      enterprise_id: filters.enterprise_id,
      payroll_id: filters.payroll_id ?? null,
      run_id: filters.run_id ?? null
    };
    const enterpriseOnlyBinds = { enterprise_id: filters.enterprise_id };
    const enterpriseSourceRunBinds = {
      enterprise_id: filters.enterprise_id,
      run_id: filters.run_id ?? null
    };

    const runsSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT,
             SUM(TOTAL_EMPLOYEES) AS TOTAL_EMPLOYEES, SUM(ERROR_EMPLOYEES) AS ERROR_EMPLOYEES
      FROM PAY.PAYROLL_RUNS
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:payroll_id IS NULL OR PAYROLL_ID = :payroll_id)
        AND (:run_id IS NULL OR RUN_ID = :run_id)
        AND (:period_start_date IS NULL OR PERIOD_START_DATE >= TO_DATE(:period_start_date, 'YYYY-MM-DD'))
        AND (:period_end_date IS NULL OR PERIOD_END_DATE <= TO_DATE(:period_end_date, 'YYYY-MM-DD'))
      GROUP BY STATUS_CODE
    `;

    const paymentsSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT, SUM(TOTAL_PAYMENT_AMOUNT) AS TOTAL_AMOUNT
      FROM PAY.V_PAY_PAYMENT_BATCHES
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:payroll_id IS NULL OR PAYROLL_ID = :payroll_id)
        AND (:run_id IS NULL OR RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const glSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT, SUM(TOTAL_DEBIT) AS TOTAL_DEBIT, SUM(TOTAL_CREDIT) AS TOTAL_CREDIT
      FROM PAY.V_PAY_GL_JOURNAL_BATCHES
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:run_id IS NULL OR SOURCE_RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const payslipsSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT, SUM(NET_PAY) AS TOTAL_NET_PAY
      FROM PAY.V_PAY_PAYSLIPS
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:payroll_id IS NULL OR PAYROLL_ID = :payroll_id)
        AND (:run_id IS NULL OR RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const approvalsSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT
      FROM PAY.V_PAY_APPROVAL_REQUESTS
      WHERE ENTERPRISE_ID = :enterprise_id
      GROUP BY STATUS_CODE
    `;

    const statutorySql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT
      FROM PAY.V_PAY_STATUTORY_FILINGS
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:run_id IS NULL OR RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const healthSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT,
             SUM(PASS_COUNT) AS PASS_COUNT, SUM(WARN_COUNT) AS WARN_COUNT, SUM(FAIL_COUNT) AS FAIL_COUNT
      FROM PAY.PAY_HEALTH_CHECK_RUNS
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:run_id IS NULL OR SOURCE_RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const certsSql = `
      SELECT STATUS_CODE AS GROUP_KEY, COUNT(*) AS CNT
      FROM PAY.V_PAY_PROD_CERTIFICATIONS
      WHERE ENTERPRISE_ID = :enterprise_id
        AND (:run_id IS NULL OR SOURCE_RUN_ID = :run_id)
      GROUP BY STATUS_CODE
    `;

    const [runs, payments, gl, payslips, approvals, statutory, health, certs] = await Promise.all([
      connection.execute(runsSql, runBinds, opts),
      connection.execute(paymentsSql, enterpriseRunBinds, opts),
      connection.execute(glSql, enterpriseSourceRunBinds, opts),
      connection.execute(payslipsSql, enterpriseRunBinds, opts),
      connection.execute(approvalsSql, enterpriseOnlyBinds, opts),
      connection.execute(statutorySql, enterpriseSourceRunBinds, opts),
      connection.execute(healthSql, enterpriseSourceRunBinds, opts),
      connection.execute(certsSql, enterpriseSourceRunBinds, opts)
    ]);

    const sumField = (rows, field) => rows.reduce((acc, r) => acc + Number(r[field] || 0), 0);

    return {
      runs: {
        total: sumField(runs.rows, 'CNT'),
        total_employees: sumField(runs.rows, 'TOTAL_EMPLOYEES'),
        error_employees: sumField(runs.rows, 'ERROR_EMPLOYEES'),
        by_status: groupCounts(runs.rows)
      },
      payments: {
        total_batches: sumField(payments.rows, 'CNT'),
        total_amount: sumField(payments.rows, 'TOTAL_AMOUNT'),
        by_status: groupCounts(payments.rows)
      },
      gl: {
        total_batches: sumField(gl.rows, 'CNT'),
        total_debit: sumField(gl.rows, 'TOTAL_DEBIT'),
        total_credit: sumField(gl.rows, 'TOTAL_CREDIT'),
        by_status: groupCounts(gl.rows)
      },
      payslips: {
        total: sumField(payslips.rows, 'CNT'),
        total_net_pay: sumField(payslips.rows, 'TOTAL_NET_PAY'),
        by_status: groupCounts(payslips.rows)
      },
      approvals: {
        total: sumField(approvals.rows, 'CNT'),
        by_status: groupCounts(approvals.rows)
      },
      statutory: {
        total_filings: sumField(statutory.rows, 'CNT'),
        by_status: groupCounts(statutory.rows)
      },
      health_checks: {
        total_runs: sumField(health.rows, 'CNT'),
        pass_count: sumField(health.rows, 'PASS_COUNT'),
        warn_count: sumField(health.rows, 'WARN_COUNT'),
        fail_count: sumField(health.rows, 'FAIL_COUNT'),
        by_status: groupCounts(health.rows)
      },
      certifications: {
        total: sumField(certs.rows, 'CNT'),
        by_status: groupCounts(certs.rows)
      }
    };
  });
}
