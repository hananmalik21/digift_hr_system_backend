/**
 * Service: Offset-paginated employee assignment list from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST.
 * GET /api/empl/employee-assignments
 */

import oracledb from 'oracledb';
import { getConnection } from '../config/db.js';
import { employeeAccessBypassBindClause } from '../utils/userContext.js';
import {
  EMPL_ASSIGNMENTS_LIST_SELECT_SQL,
  EMPL_ASSIGNMENTS_SEARCH_KEY_CONDITION,
  assertPositiveEnterpriseId,
  assertPositiveUserId,
  buildEmployeeAssignmentsListFromClause,
  normalizeEmployeeAssignmentListRow
} from '../utils/employeeAssignmentViewUtils.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parsePositiveInt(value, fallback) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

function buildWhereAndBinds(params) {
  const conditions = ['v.ENTERPRISE_ID = :enterprise_id'];
  const binds = {
    user_id: params.user_id,
    enterprise_id: params.enterprise_id
  };

  if (params.search != null && String(params.search).trim() !== '') {
    conditions.push(EMPL_ASSIGNMENTS_SEARCH_KEY_CONDITION);
    binds.search = String(params.search).trim();
  }

  if (params.status != null && String(params.status).trim() !== '') {
    conditions.push('v.EMPLOYEE_STATUS = UPPER(:status)');
    binds.status = String(params.status).trim();
  }

  if (params.employee_id != null && params.employee_id !== '') {
    conditions.push('v.EMPLOYEE_ID = :employee_id');
    binds.employee_id = Number(params.employee_id);
  }

  if (params.bypass_employee_access) {
    conditions.push(employeeAccessBypassBindClause(':user_id'));
  }

  return {
    whereClause: conditions.join(' AND '),
    binds
  };
}

/**
 * Fetch paginated employee assignment list.
 * @param {Object} params
 * @returns {Promise<{ data: Object[], pagination: { page: number, limit: number, total: number, totalPages: number } }>}
 */
export async function getEmplEmployeeAssignmentsList(params) {
  const enterpriseId = assertPositiveEnterpriseId(params.enterprise_id);
  const userId = assertPositiveUserId(params.user_id);

  const page = parsePositiveInt(params.page, DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, parsePositiveInt(params.limit, DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const accessOptions = params.bypass_employee_access ? { bypass: true } : undefined;
  const { whereClause, binds } = buildWhereAndBinds({
    user_id: userId,
    enterprise_id: enterpriseId,
    search: params.search,
    status: params.status,
    employee_id: params.employee_id,
    bypass_employee_access: params.bypass_employee_access
  });

  const baseFrom = buildEmployeeAssignmentsListFromClause(accessOptions);
  const countSql = `SELECT COUNT(*) AS total_records FROM ${baseFrom} WHERE ${whereClause}`;
  const dataSql = `SELECT ${EMPL_ASSIGNMENTS_LIST_SELECT_SQL}
  FROM ${baseFrom}
  WHERE ${whereClause}
  ORDER BY v.EMPLOYEE_NUMBER ASC NULLS LAST, v.EMPLOYEE_ID ASC
  OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

  const dataBinds = { ...binds, offset, limit };

  let connection;
  try {
    connection = await getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(dataSql, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    const total = countResult.rows?.[0]?.TOTAL_RECORDS != null
      ? Number(countResult.rows[0].TOTAL_RECORDS)
      : 0;
    const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

    return {
      data: (dataResult.rows || []).map(normalizeEmployeeAssignmentListRow),
      pagination: { page, limit, total, totalPages }
    };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}
