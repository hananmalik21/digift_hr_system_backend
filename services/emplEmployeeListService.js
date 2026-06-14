/**
 * Service: Cursor-based employee list from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST (RN=1).
 * GET /api/empl/employees — filters, sorting, cursor pagination.
 */

import oracledb from 'oracledb';
import { getConnection } from '../config/db.js';
import { employeeAccessJoin, employeeAccessBypassBindClause } from '../utils/userContext.js';
import {
  EMPL_EMPLOYEE_ASSIGNMENTS_LIST_VIEW,
  EMPL_ASSIGNMENTS_SEARCH_KEY_CONDITION,
  assertPositiveEnterpriseId,
  assertPositiveUserId,
  normalizeEmployeeListRowWithPosition,
  safeJson,
  safeJsonParse
} from '../utils/employeeAssignmentViewUtils.js';

export { safeJson, safeJsonParse };

const VIEW = EMPL_EMPLOYEE_ASSIGNMENTS_LIST_VIEW;

const SORT_BY_WHITELIST = new Set(['employee_id', 'employee_number', 'last_update_date', 'effective_start_date']);
const SORT_COLUMN_SQL = {
  employee_id: 'v.EMPLOYEE_ID',
  employee_number: 'v.EMPLOYEE_NUMBER',
  last_update_date: 'v.LAST_UPDATE_DATE',
  effective_start_date: 'v.EFFECTIVE_START_DATE'
};
const SORT_COLUMN_IS_DATE = new Set(['last_update_date', 'effective_start_date']);

const DEFAULT_SORT_BY = 'employee_id';
const DEFAULT_SORT_DIR = 'DESC';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Encode cursor payload to base64 string.
 * @param {{ sort_by: string, sort_dir: string, last_sort_value: string|number|null, last_employee_id: number }} payload
 * @returns {string}
 */
export function encodeCursor(payload) {
  if (!payload || (payload.last_sort_value == null && payload.last_employee_id == null)) return null;
  try {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  } catch {
    return null;
  }
}

/**
 * Decode base64 cursor to payload. Returns null if invalid.
 * @param {string} cursor
 * @returns {{ sort_by: string, sort_dir: string, last_sort_value: string|number|null, last_employee_id: number }|null}
 */
export function decodeCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8');
    const p = JSON.parse(json);
    if (p == null || typeof p !== 'object') return null;
    if (!SORT_BY_WHITELIST.has(p.sort_by)) p.sort_by = DEFAULT_SORT_BY;
    if (p.sort_dir !== 'ASC' && p.sort_dir !== 'DESC') p.sort_dir = DEFAULT_SORT_DIR;
    return p;
  } catch {
    return null;
  }
}

/**
 * Normalize hex for bind: 32-char hex, uppercase, no dashes.
 * @param {string|null} hex
 * @returns {string|null}
 */
function normalizeHex(hex) {
  if (hex == null || typeof hex !== 'string') return null;
  const s = String(hex).replace(/-/g, '').trim().toUpperCase();
  return s.length === 32 && /^[0-9A-F]+$/.test(s) ? s : null;
}

/**
 * Build WHERE conditions and bind object for list query.
 * - enterprise_id required
 * - user_id required (used for FNDSEC data-access JOIN)
 * - Optional: org_unit_id (JSON_EXISTS on ORG_STRUCTURE_LIST_JSON), position_id (HEXTORAW), job_family_id, job_level_id, grade_id, employment_status, employee_status (ACTIVE/PROBATION/INACTIVE), contract_type_code, work_location_id, search (LIKE on multiple text cols)
 * @param {Object} params
 * @returns {{ whereParts: string[], binds: Object }}
 */
function buildWhereAndBinds(params) {
  const whereParts = ['v.ENTERPRISE_ID = :enterprise_id', 'v.RN = 1'];
  const binds = {
    user_id: params.user_id,
    enterprise_id: params.enterprise_id,
    limit_plus_one: (params.limit || DEFAULT_LIMIT) + 1
  };

  const orgUnitHex = normalizeHex(params.org_unit_id);
  if (orgUnitHex) {
    whereParts.push(`JSON_EXISTS(v.ORG_STRUCTURE_LIST_JSON, '$[*]?(@.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid")`);
    binds.org_unit_id_hex = orgUnitHex;
  }

  const positionHex = normalizeHex(params.position_id);
  if (positionHex) {
    whereParts.push('v.POSITION_ID = HEXTORAW(:position_id_hex)');
    binds.position_id_hex = positionHex;
  }

  if (params.job_family_id != null && params.job_family_id !== '') {
    whereParts.push('v.JOB_FAMILY_ID = :job_family_id');
    binds.job_family_id = Number(params.job_family_id);
  }
  if (params.job_level_id != null && params.job_level_id !== '') {
    whereParts.push('v.JOB_LEVEL_ID = :job_level_id');
    binds.job_level_id = Number(params.job_level_id);
  }
  if (params.grade_id != null && params.grade_id !== '') {
    whereParts.push('v.GRADE_ID = :grade_id');
    binds.grade_id = Number(params.grade_id);
  }
  if (params.employment_status != null && String(params.employment_status).trim() !== '') {
    whereParts.push('v.EMPLOYMENT_STATUS = :employment_status');
    binds.employment_status = String(params.employment_status).trim();
  }
  if (params.employee_status != null && String(params.employee_status).trim() !== '') {
    whereParts.push('v.EMPLOYEE_STATUS = :employee_status');
    binds.employee_status = String(params.employee_status).trim().toUpperCase();
  }
  if (params.contract_type_code != null && String(params.contract_type_code).trim() !== '') {
    whereParts.push('v.CONTRACT_TYPE_CODE = :contract_type_code');
    binds.contract_type_code = String(params.contract_type_code).trim();
  }
  if (params.work_location_id != null && params.work_location_id !== '') {
    whereParts.push('v.WORK_LOCATION_ID = :work_location_id');
    binds.work_location_id = Number(params.work_location_id);
  }

  const search = params.search != null && String(params.search).trim() !== '' ? String(params.search).trim() : null;
  if (search) {
    whereParts.push(EMPL_ASSIGNMENTS_SEARCH_KEY_CONDITION);
    binds.search = search;
  }

  return { whereParts, binds };
}

/**
 * Build cursor condition (for keyset pagination) and ORDER BY.
 * sort_by is whitelisted; sort_dir ASC/DESC. Tiebreaker: EMPLOYEE_ID.
 * @param {{ sort_by: string, sort_dir: string }} cursor
 * @param {Object} binds - mutated: adds last_sort_value, last_employee_id if cursor present
 * @returns {{ cursorCondition: string, orderBy: string }}
 */
function buildCursorAndOrder(cursor, binds) {
  const sortBy = SORT_BY_WHITELIST.has(cursor?.sort_by) ? cursor.sort_by : DEFAULT_SORT_BY;
  const sortDir = cursor?.sort_dir === 'ASC' ? 'ASC' : 'DESC';
  const sortCol = SORT_COLUMN_SQL[sortBy];

  const orderBy = `${sortCol} ${sortDir} NULLS LAST, v.EMPLOYEE_ID ${sortDir}`;

  if (!cursor || (cursor.last_sort_value == null && cursor.last_employee_id == null)) {
    return { cursorCondition: '', orderBy, binds };
  }

  binds.last_employee_id = cursor.last_employee_id;
  const isDateCol = SORT_COLUMN_IS_DATE.has(sortBy);
  if (isDateCol) {
    binds.last_sort_value_ts = cursor.last_sort_value;
  } else {
    binds.last_sort_value = cursor.last_sort_value;
  }
  const sortColCmp = isDateCol
    ? `TO_TIMESTAMP_TZ(:last_sort_value_ts, 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"')`
    : ':last_sort_value';

  let cursorCondition;
  if (sortDir === 'DESC') {
    cursorCondition = ` AND (
      (${sortCol} < ${sortColCmp})
      OR (${sortCol} = ${sortColCmp} AND v.EMPLOYEE_ID < :last_employee_id)
    )`;
  } else {
    cursorCondition = ` AND (
      (${sortCol} > ${sortColCmp})
      OR (${sortCol} = ${sortColCmp} AND v.EMPLOYEE_ID > :last_employee_id)
    )`;
  }

  return { cursorCondition, orderBy, binds };
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Fetch one page of employees with cursor-based pagination.
 * @param {Object} params - enterprise_id (required), user_id (required - FNDSEC data access), limit, cursor, sort_by, sort_dir, filters (org_unit_id, position_id, job_family_id, job_level_id, grade_id, employment_status, employee_status, contract_type_code, work_location_id, search)
 * @returns {Promise<{ data: Object[], next_cursor: string|null, has_next: boolean }>}
 */
export async function getEmplEmployeesList(params) {
  const enterpriseId = assertPositiveEnterpriseId(params.enterprise_id);
  const userId = assertPositiveUserId(params.user_id);

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit, 10) || DEFAULT_LIMIT));
  const cursor = decodeCursor(params.cursor) || { sort_by: params.sort_by || DEFAULT_SORT_BY, sort_dir: params.sort_dir || DEFAULT_SORT_DIR };

  const { whereParts, binds } = buildWhereAndBinds({ ...params, enterprise_id: enterpriseId, user_id: userId, limit });
  const { cursorCondition, orderBy, binds: cursorBinds } = buildCursorAndOrder(cursor, binds);
  Object.assign(binds, cursorBinds);

  const accessOptions = params.bypass_employee_access ? { bypass: true } : undefined;
  if (params.bypass_employee_access) {
    whereParts.push(employeeAccessBypassBindClause(':user_id'));
  }
  const whereClause = whereParts.join(' AND ');
  const sql = `SELECT v.* FROM ${VIEW} v
  ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id', accessOptions)}
  WHERE ${whereClause}
  ${cursorCondition}
  ORDER BY ${orderBy}
  FETCH FIRST :limit_plus_one ROWS ONLY`;

  let connection;
  try {
    connection = await getConnection();
    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT
    });
    const rows = result.rows || [];
    const hasNext = rows.length > limit;
    const pageRows = hasNext ? rows.slice(0, limit) : rows;
    const data = pageRows.map(normalizeEmployeeListRowWithPosition);

    let next_cursor = null;
    if (hasNext && pageRows.length > 0) {
      const last = pageRows[pageRows.length - 1];
      const sortCol = cursor.sort_by === 'employee_id' ? 'EMPLOYEE_ID' : cursor.sort_by === 'employee_number' ? 'EMPLOYEE_NUMBER' : cursor.sort_by === 'last_update_date' ? 'LAST_UPDATE_DATE' : 'EFFECTIVE_START_DATE';
      const lastSortValue = last[sortCol] ?? last[sortCol.toLowerCase()];
      const lastEmployeeId = last.EMPLOYEE_ID ?? last.employee_id;
      next_cursor = encodeCursor({
        sort_by: cursor.sort_by,
        sort_dir: cursor.sort_dir,
        last_sort_value: lastSortValue != null && lastSortValue instanceof Date ? lastSortValue.toISOString() : lastSortValue,
        last_employee_id: Number(lastEmployeeId)
      });
    }

    return { data, next_cursor, has_next: hasNext };
  } finally {
    if (connection) {
      try { await connection.close(); } catch (_) {}
    }
  }
}
