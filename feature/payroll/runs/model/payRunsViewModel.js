/**
 * DigifyHR Payroll — Run read queries.
 *
 * No dedicated run view exists yet; reads go directly against tables:
 *   PAY.PAYROLL_RUNS                — run header / status
 *   PAY.PAYROLL_REL_ACTIONS         — per-employee actions within a run
 *   PAY.PAY_ELEMENT_RESULTS         — element calculation results
 *   PAY.PAY_EMPLOYEE_BALANCE_RESULTS — balance results (used for gross/net/deductions)
 *   PAY.PAY_BALANCES                — balance definitions (names/codes)
 */

import oracledb from 'oracledb';
import {
  mapPayRow,
  queryPayList,
  queryPayMany,
  queryPayOne
} from '../../shared/index.js';
import { withPayViewConnection, logPayViewOracleError } from '../../../pay/utils/payViewModelUtils.js';

const RUNS_TABLE = 'PAY.PAYROLL_RUNS v';
const ACTIONS_TABLE = 'PAY.PAYROLL_REL_ACTIONS v';
const RESULTS_TABLE = 'PAY.PAY_ELEMENT_RESULTS v';
const BALANCE_RESULTS_JOIN = `PAY.PAY_EMPLOYEE_BALANCE_RESULTS v
  LEFT JOIN PAY.PAY_BALANCES b ON b.BALANCE_ID = v.BALANCE_ID`;

const LOG_TAG = 'payRunsViewModel';

const RUN_SORT = {
  run_id: 'v.RUN_ID',
  run_number: 'v.RUN_NUMBER',
  period_start_date: 'v.PERIOD_START_DATE',
  payment_date: 'v.PAYMENT_DATE',
  creation_date: 'v.CREATION_DATE'
};

const ERROR_STATUS_CODES = ['ERROR', 'FAILED', 'FAILURE', 'EXCEPTION', 'REJECTED'];

/**
 * @param {{ enterprise_id: number, payroll_id?: number, run_type_code?: string, status_code?: string, page: number, pageSize: number, sortBy?: string, sortOrder?: string }} filters
 * status_code is the persisted PAY.PAYROLL_RUNS.STATUS_CODE (includes READY_TO_FINALIZE).
 * SELECT v.* returns flow_submission_id when the column exists.
 */
export async function listRuns(filters) {
  return queryPayList({
    fromSql: RUNS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.PAYROLL_ID = :payroll_id', bind: 'payroll_id', value: filters.payroll_id },
      { sql: 'v.RUN_TYPE_CODE = :run_type_code', bind: 'run_type_code', value: filters.run_type_code },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.status_code }
    ],
    allowedSort: RUN_SORT,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: LOG_TAG
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function getRunById(enterpriseId, runId) {
  return queryPayOne({
    fromSql: RUNS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId },
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId }
    ],
    logTag: LOG_TAG
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, status_code?: string, page: number, pageSize: number }} filters
 */
export async function listRunEmployees(filters) {
  return queryPayList({
    fromSql: ACTIONS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.STATUS_CODE = :status_code', bind: 'status_code', value: filters.status_code }
    ],
    defaultSort: 'v.EMPLOYEE_ID ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: LOG_TAG
  });
}

/**
 * Full per-employee action history for the run, most recent first.
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function listRunActions(filters) {
  return queryPayList({
    fromSql: ACTIONS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id }
    ],
    defaultSort: 'v.CREATION_DATE DESC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: LOG_TAG
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function listRunResults(filters) {
  return queryPayList({
    fromSql: RESULTS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id }
    ],
    defaultSort: 'v.EMPLOYEE_ID ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: LOG_TAG
  });
}

/**
 * @param {{ enterprise_id: number, run_id: number, employee_id?: number, page: number, pageSize: number }} filters
 */
export async function listRunBalances(filters) {
  return queryPayList({
    fromSql: BALANCE_RESULTS_JOIN,
    selectSql: 'v.*, b.BALANCE_CODE, b.BALANCE_NAME',
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'v.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id }
    ],
    defaultSort: 'v.EMPLOYEE_ID ASC',
    page: filters.page,
    pageSize: filters.pageSize,
    logTag: LOG_TAG
  });
}

/**
 * Employee actions in error: STATUS_CODE in known error states OR ERROR_CODE present.
 * @param {{ enterprise_id: number, run_id: number, page: number, pageSize: number }} filters
 */
export async function listRunExceptions(filters) {
  const statusPlaceholders = ERROR_STATUS_CODES.map((_, i) => `:err_status_${i}`).join(', ');
  const statusBinds = {};
  ERROR_STATUS_CODES.forEach((code, i) => {
    statusBinds[`err_status_${i}`] = code;
  });

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  // queryPayList's declarative filter builder doesn't support binding an
  // IN-list array, so exceptions are queried directly with explicit binds.
  const sql = `
    SELECT v.*, COUNT(*) OVER() AS TOTAL_COUNT
    FROM ${ACTIONS_TABLE}
    WHERE v.ENTERPRISE_ID = :enterprise_id
      AND v.RUN_ID = :run_id
      AND (v.STATUS_CODE IN (${statusPlaceholders}) OR v.ERROR_CODE IS NOT NULL)
    ORDER BY v.EMPLOYEE_ID ASC
    OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY
  `;
  const binds = {
    enterprise_id: filters.enterprise_id,
    run_id: filters.run_id,
    ...statusBinds,
    offset,
    page_size: pageSize
  };

  return withPayViewConnection(async (connection) => {
    try {
      const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = result.rows || [];
      const total = rows.length ? Number(rows[0].TOTAL_COUNT || 0) : 0;
      const data = await Promise.all(rows.map((row) => mapPayRow(row)));
      return { data, total, page, pageSize };
    } catch (err) {
      logPayViewOracleError(LOG_TAG, 'exceptions', err);
      throw err;
    }
  });
}

/**
 * Employee action rows for a run, capped, used to compute summary counts.
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function listAllRunActions(enterpriseId, runId) {
  return queryPayMany({
    fromSql: ACTIONS_TABLE,
    alias: 'v',
    filters: [
      { sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId },
      { sql: 'v.RUN_ID = :run_id', bind: 'run_id', value: runId }
    ],
    maxRows: 5000,
    logTag: LOG_TAG
  });
}

/**
 * Gross / deductions / net totals for a run.
 * Preferred source: PAY_EMPLOYEE_BALANCE_RESULTS joined to PAY_BALANCES by
 * BALANCE_CODE. Falls back to summing PAY_ELEMENT_RESULTS by
 * RESULT_TYPE_CODE / RESULT_VALUE_CODE, then to nulls if neither resolves.
 * @param {number} enterpriseId
 * @param {number} runId
 */
export async function getRunFinancialTotals(enterpriseId, runId) {
  const fromBalances = await tryBalanceFinancialTotals(enterpriseId, runId);
  if (fromBalances) return fromBalances;

  const fromResults = await tryElementResultFinancialTotals(enterpriseId, runId);
  if (fromResults) return fromResults;

  return { gross: null, deductions: null, net: null };
}

async function tryBalanceFinancialTotals(enterpriseId, runId) {
  const sql = `
    SELECT UPPER(b.BALANCE_CODE) AS BALANCE_CODE,
           SUM(NVL(v.CLOSING_VALUE, v.RUN_CONTRIBUTION_VALUE)) AS TOTAL_VALUE
    FROM PAY.PAY_EMPLOYEE_BALANCE_RESULTS v
    JOIN PAY.PAY_BALANCES b ON b.BALANCE_ID = v.BALANCE_ID
    WHERE v.ENTERPRISE_ID = :enterprise_id
      AND v.RUN_ID = :run_id
      AND UPPER(b.BALANCE_CODE) IN ('GROSS', 'DEDUCTIONS', 'DEDUCTION', 'NET', 'NET_PAY')
    GROUP BY UPPER(b.BALANCE_CODE)
  `;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        { enterprise_id: enterpriseId, run_id: runId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const rows = result.rows || [];
      if (!rows.length) return null;
      return reduceFinancialRows(rows, 'BALANCE_CODE', 'TOTAL_VALUE');
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'financialTotals:balances', err);
    return null;
  }
}

async function tryElementResultFinancialTotals(enterpriseId, runId) {
  const sql = `
    SELECT UPPER(NVL(v.RESULT_TYPE_CODE, v.RESULT_VALUE_CODE)) AS RESULT_CODE, SUM(v.RESULT_VALUE) AS TOTAL_VALUE
    FROM PAY.PAY_ELEMENT_RESULTS v
    WHERE v.ENTERPRISE_ID = :enterprise_id
      AND v.RUN_ID = :run_id
    GROUP BY UPPER(NVL(v.RESULT_TYPE_CODE, v.RESULT_VALUE_CODE))
  `;

  try {
    return await withPayViewConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        { enterprise_id: enterpriseId, run_id: runId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const rows = result.rows || [];
      if (!rows.length) return null;
      return reduceFinancialRows(rows, 'RESULT_CODE', 'TOTAL_VALUE');
    });
  } catch (err) {
    logPayViewOracleError(LOG_TAG, 'financialTotals:elementResults', err);
    return null;
  }
}

function reduceFinancialRows(rows, codeKey, valueKey) {
  const totals = { gross: null, deductions: null, net: null };
  for (const row of rows) {
    const code = String(row[codeKey] || '').toUpperCase();
    const value = Number(row[valueKey]);
    const numeric = Number.isFinite(value) ? value : null;
    if (/^GROSS/.test(code) || /EARNING/.test(code)) totals.gross = numeric;
    else if (/DEDUCT/.test(code)) totals.deductions = numeric;
    else if (/^NET/.test(code)) totals.net = numeric;
  }
  return totals;
}
