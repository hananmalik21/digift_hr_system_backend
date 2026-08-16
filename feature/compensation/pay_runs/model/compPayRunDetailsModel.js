/**
 * Oracle reads from COMP.V_COMP_PAY_RUN_DETAILS.
 * Named bind variables only; connections are always released via withCompSchemaConnection.
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { readScalarCount, wrapSalaryStructureViewDbError } from '../../salary_structures/utils/oracleListHelpers.js';
import {
  employeeAccessFunctionPredicate,
  nullableEmployeeAccessPredicate
} from '../../../../utils/userContext.js';
import { VIEW, LOG_TAG } from '../constants.js';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const HEADER_COLUMNS = `
    v.PAY_RUN_ID,
    v.ENTERPRISE_ID,
    v.PAY_RUN_PLAN_ID,
    v.RUN_TYPE,
    v.RUN_STATUS,
    v.RUN_START_DATE,
    v.RUN_END_DATE,
    v.TOTAL_SELECTED,
    v.TOTAL_PROCESSED,
    v.TOTAL_FAILED,
    v.PROCESS_MONTH_NAME,
    v.PROCESS_MONTH_NO,
    v.PROCESS_YEAR,
    v.PROCESS_PERIOD,
    v.PROCESS_PERIOD_CODE,
    v.RUN_CREATED_BY,
    v.RUN_CREATION_DATE,
    v.RUN_LAST_UPDATED_BY,
    v.RUN_LAST_UPDATE_DATE
`.trim();

const DETAIL_COLUMNS = `${HEADER_COLUMNS},
    v.EMPLOYEE_ID,
    v.LINE_PLAN_ID,
    v.COMPONENT_ID,
    v.ASSIGNMENT_DTL_ID,
    v.AMOUNT,
    v.CURRENCY_CODE,
    v.PROCESS_STATUS,
    v.ERROR_MESSAGE,
    v.PROCESSED_DATE,
    v.LINE_CREATED_BY,
    v.LINE_CREATION_DATE,
    v.LINE_LAST_UPDATED_BY`;

const PAY_RUN_ORDER_SQL = `q.PROCESS_YEAR DESC, q.PROCESS_MONTH_NO DESC, q.PAY_RUN_ID DESC`;

function qualify(columns, alias) {
  return columns.replace(/\bv\./g, `${alias}.`);
}

function wrapDbError(err, context) {
  return wrapSalaryStructureViewDbError(err, context, LOG_TAG);
}

function accessOptions(filters) {
  return filters.bypass_employee_access ? { bypass: true } : undefined;
}

function bindUserAccess(filters, binds) {
  if (filters.user_id == null) return '';
  binds.user_id = filters.user_id;
  return employeeAccessFunctionPredicate(
    'v.ENTERPRISE_ID',
    'v.EMPLOYEE_ID',
    ':user_id',
    accessOptions(filters)
  );
}

/**
 * Tenant + optional employee + FNDSEC employee-access predicate.
 * `:employee_id` is always bound (null when unused) so Oracle can evaluate IS NULL.
 */
function detailsWhereSql(filters, { requireEmployeeId = false, processStatus = null } = {}) {
  const parts = ['v.ENTERPRISE_ID = :enterprise_id', 'v.PAY_RUN_ID = :pay_run_id'];
  const binds = {
    enterprise_id: filters.enterprise_id,
    pay_run_id: filters.pay_run_id
  };

  if (requireEmployeeId) {
    parts.push('v.EMPLOYEE_ID = :employee_id');
    binds.employee_id = filters.employee_id;
  } else {
    parts.push('(:employee_id IS NULL OR v.EMPLOYEE_ID = :employee_id)');
    binds.employee_id = filters.employee_id ?? null;
  }

  if (processStatus) {
    parts.push('v.PROCESS_STATUS = :process_status');
    binds.process_status = processStatus;
  }

  if (filters.user_id != null) {
    parts.push(
      nullableEmployeeAccessPredicate(
        'v.ENTERPRISE_ID',
        'v.EMPLOYEE_ID',
        ':user_id',
        accessOptions(filters)
      )
    );
    binds.user_id = filters.user_id;
  }

  return { whereSql: `WHERE ${parts.join('\n  AND ')}`, binds };
}

function paginationBinds(filters, filterBinds) {
  return {
    ...filterBinds,
    skip_rows: (filters.page - 1) * filters.limit,
    fetch_next: filters.limit
  };
}

async function executeOnConnection(context, sql, binds) {
  return withCompSchemaConnection(async (conn) => {
    try {
      const result = await conn.execute(sql, binds, ROW_OBJECT);
      return result.rows || [];
    } catch (err) {
      throw wrapDbError(err, context);
    }
  });
}

async function executePaged(context, { countSql, dataSql, binds, filters }) {
  return withCompSchemaConnection(async (conn) => {
    try {
      const countResult = await conn.execute(countSql, binds, ROW_OBJECT);
      const dataResult = await conn.execute(dataSql, paginationBinds(filters, binds), ROW_OBJECT);
      return { rows: dataResult.rows || [], total: readScalarCount(countResult) };
    } catch (err) {
      throw wrapDbError(err, context);
    }
  });
}

function pagedDetailQuery(whereSql, orderBy) {
  return {
    countSql: `SELECT COUNT(*) AS CNT FROM ${VIEW} v ${whereSql}`,
    dataSql: `
SELECT ${DETAIL_COLUMNS}
FROM ${VIEW} v
${whereSql}
ORDER BY ${orderBy}
OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY
`.trim()
  };
}

function distinctPayRunQuery(fromSql) {
  return {
    countSql: `
SELECT COUNT(*) AS CNT FROM (
  SELECT DISTINCT v.PAY_RUN_ID
  ${fromSql}
) q
`.trim(),
    dataSql: `
SELECT ${qualify(HEADER_COLUMNS, 'q')}
FROM (
    SELECT DISTINCT
        ${HEADER_COLUMNS}
    ${fromSql}
) q
ORDER BY ${PAY_RUN_ORDER_SQL}
OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY
`.trim()
  };
}

async function listDetailRows(filters, { processStatus, requireEmployeeId, orderBy, context }) {
  const { whereSql, binds } = detailsWhereSql(filters, { processStatus, requireEmployeeId });
  return executePaged(context, { ...pagedDetailQuery(whereSql, orderBy), binds, filters });
}

/**
 * Header existence for the enterprise — does not apply employee-access filtering
 * so a pay run is not reported as missing when the caller cannot see its employees.
 */
export async function findPayRunHeader(enterpriseId, payRunId) {
  const sql = `
SELECT ${HEADER_COLUMNS}
FROM ${VIEW} v
WHERE v.ENTERPRISE_ID = :enterprise_id
  AND v.PAY_RUN_ID = :pay_run_id
FETCH FIRST 1 ROW ONLY
`.trim();
  const rows = await executeOnConnection('findPayRunHeader', sql, {
    enterprise_id: enterpriseId,
    pay_run_id: payRunId
  });
  return rows[0] || null;
}

/**
 * Flat detail lines for a pay run (optional employee_id).
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayRunDetailRows(filters) {
  return listDetailRows(filters, {
    orderBy: 'v.EMPLOYEE_ID, v.COMPONENT_ID',
    context: 'listPayRunDetailRows'
  });
}

/**
 * All lines for one employee in a pay run (no pagination — one employee).
 */
export async function listPayRunEmployeeDetailRows(filters) {
  const { whereSql, binds } = detailsWhereSql(filters, { requireEmployeeId: true });
  const sql = `
SELECT ${DETAIL_COLUMNS}
FROM ${VIEW} v
${whereSql}
ORDER BY v.COMPONENT_ID
`.trim();
  return executeOnConnection('listPayRunEmployeeDetailRows', sql, binds);
}

/**
 * One aggregated row per employee processed in the pay run.
 */
export async function listPayRunEmployeeSummaries(filters) {
  const binds = {
    enterprise_id: filters.enterprise_id,
    pay_run_id: filters.pay_run_id
  };
  const accessSql = bindUserAccess(filters, binds);
  const accessClause = accessSql ? `AND ${accessSql}` : '';

  const groupedFrom = `
FROM ${VIEW} v
WHERE v.ENTERPRISE_ID = :enterprise_id
  AND v.PAY_RUN_ID = :pay_run_id
  AND v.EMPLOYEE_ID IS NOT NULL
  ${accessClause}
GROUP BY v.EMPLOYEE_ID
`.trim();

  return executePaged('listPayRunEmployeeSummaries', {
    countSql: `SELECT COUNT(*) AS CNT FROM (SELECT v.EMPLOYEE_ID ${groupedFrom}) q`,
    dataSql: `
SELECT
    q.EMPLOYEE_ID,
    q.TOTAL_LINES,
    q.TOTAL_AMOUNT,
    q.COMPLETED_LINES,
    q.FAILED_LINES
FROM (
    SELECT
        v.EMPLOYEE_ID,
        COUNT(*) AS TOTAL_LINES,
        SUM(NVL(v.AMOUNT, 0)) AS TOTAL_AMOUNT,
        SUM(CASE WHEN v.PROCESS_STATUS = 'COMPLETED' THEN 1 ELSE 0 END) AS COMPLETED_LINES,
        SUM(CASE WHEN v.PROCESS_STATUS = 'FAILED' THEN 1 ELSE 0 END) AS FAILED_LINES
    ${groupedFrom}
) q
ORDER BY q.EMPLOYEE_ID
OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY
`.trim(),
    binds,
    filters
  });
}

/**
 * Failed lines for a pay run (optional employee_id).
 */
export async function listFailedPayRunLines(filters) {
  return listDetailRows(filters, {
    processStatus: 'FAILED',
    orderBy: 'v.EMPLOYEE_ID, v.COMPONENT_ID',
    context: 'listFailedPayRunLines'
  });
}

/**
 * Distinct pay runs in which the employee appears.
 */
export async function listPayRunsByEmployee(filters) {
  const binds = {
    enterprise_id: filters.enterprise_id,
    employee_id: filters.employee_id
  };
  const accessSql = bindUserAccess(filters, binds);
  const accessClause = accessSql ? `AND ${accessSql}` : '';

  const fromSql = `
FROM ${VIEW} v
WHERE v.ENTERPRISE_ID = :enterprise_id
  AND v.EMPLOYEE_ID = :employee_id
  ${accessClause}
`.trim();

  return executePaged('listPayRunsByEmployee', { ...distinctPayRunQuery(fromSql), binds, filters });
}

/**
 * Distinct pay-run headers for an enterprise (optional type/status/period filters).
 */
export async function listPayRuns(filters) {
  const binds = {
    enterprise_id: filters.enterprise_id,
    run_type: filters.run_type ?? null,
    run_status: filters.run_status ?? null,
    process_year: filters.process_year ?? null,
    process_month_no: filters.process_month_no ?? null
  };

  const fromSql = `
FROM ${VIEW} v
WHERE v.ENTERPRISE_ID = :enterprise_id
  AND (:run_type IS NULL OR v.RUN_TYPE = :run_type)
  AND (:run_status IS NULL OR v.RUN_STATUS = :run_status)
  AND (:process_year IS NULL OR v.PROCESS_YEAR = :process_year)
  AND (:process_month_no IS NULL OR v.PROCESS_MONTH_NO = :process_month_no)
`.trim();

  return executePaged('listPayRuns', { ...distinctPayRunQuery(fromSql), binds, filters });
}
