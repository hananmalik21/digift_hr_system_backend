/**
 * Service: Cursor-based employee list from EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST (RN=1).
 * GET /api/empl/employees — filters, sorting, cursor pagination.
 */

import oracledb from 'oracledb';
import { getConnection } from '../config/db.js';
import { employeeAccessJoin } from '../utils/userContext.js';

const VIEW = 'EMPL.V_EMPLOYEE_ASSIGNMENTS_LIST';

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
 * Parse JSON safely. Returns nested object/array when input is string; leaves objects as-is.
 * Use for org_structure_list, position_obj_json, position_obj so response never returns escaped JSON strings.
 * @param {*} v - value from driver (string, object, or null)
 * @returns {*} parsed object/array, or original value, or null
 */
export function safeJson(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

/** @deprecated Use safeJson. Kept for compatibility. */
export function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === 'object' && !(value instanceof Date)) return value;
  if (typeof value !== 'string') return fallback;
  const s = value.trim();
  if (!s || s.toLowerCase() === 'null') return fallback;
  try {
    const parsed = JSON.parse(s);
    return parsed != null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

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
 * Convert row RAW/Buffer columns to hex string for JSON. Mutates row.
 * @param {Object} row
 * @returns {Object}
 */
function rowRawToHex(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v != null && Buffer.isBuffer(v) ? v.toString('hex').toUpperCase() : v;
  }
  return out;
}

function isPositionObjEmpty(obj) {
  if (!obj || typeof obj !== 'object') return true;
  return Object.values(obj).every(v => v == null || v === '');
}

/** Minimal position shape for all employee list APIs: position_id, position_code, status, position_title_en */
function toMinimalPosition(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const id = obj.position_id ?? obj.POSITION_ID ?? obj.positionId;
  if (id == null) return null;
  return {
    position_id: id,
    position_code: obj.position_code ?? obj.POSITION_CODE ?? obj.positionCode ?? null,
    status: obj.status ?? obj.STATUS ?? obj.position_status ?? obj.POSITION_STATUS ?? null,
    position_title_en: obj.position_title_en ?? obj.POSITION_TITLE_EN ?? obj.position_name_en ?? obj.POSITION_NAME_EN ?? obj.positionTitleEn ?? null
  };
}

function buildPositionFromRow(r) {
  const positionId = r.POSITION_ID ?? r.position_id;
  if (positionId == null) return null;
  return toMinimalPosition({
    position_id: positionId,
    position_code: r.POSITION_CODE ?? r.position_code,
    status: r.POSITION_STATUS ?? r.position_status,
    position_title_en: r.POSITION_NAME_EN ?? r.POSITION_TITLE_EN ?? r.position_name_en ?? r.position_title_en
  });
}

/**
 * Normalize a list row: RAW→hex, parse JSON fields via safeJson.
 * Returns a single position: from view position_obj when non-empty, else from flat view columns, else null.
 * @param {Object} row
 * @returns {Object}
 */
function normalizeRow(row) {
  if (!row) return row;
  const r = rowRawToHex(row);
  const listRaw = r.ORG_STRUCTURE_LIST ?? r.org_structure_list ?? r.ORG_STRUCTURE_LIST_JSON ?? r.org_structure_list_json;
  let org_structure_list = safeJson(listRaw);
  if (!Array.isArray(org_structure_list)) org_structure_list = [];

  const position_obj_json = safeJson(r.POSITION_OBJ_JSON ?? r.position_obj_json);
  const position_obj = safeJson(r.POSITION_OBJ ?? r.position_obj);
  let positionObj = (typeof position_obj === 'object' && position_obj !== null)
    ? position_obj
    : (typeof position_obj_json === 'object' && position_obj_json !== null)
      ? position_obj_json
      : null;
  if (positionObj !== null && isPositionObjEmpty(positionObj)) positionObj = null;

  const out = {};
  for (const [key, value] of Object.entries(r)) {
    const lower = key.toLowerCase();
    out[lower] = value;
  }
  out.org_structure_list = org_structure_list;
  const rawPosition = (typeof positionObj === 'object' && positionObj !== null) ? positionObj : buildPositionFromRow(r);
  out.position = toMinimalPosition(rawPosition);
  delete out.org_structure_list_json;
  delete out.position_obj_json;
  delete out.position_obj;
  delete out.search_key;
  return out;
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

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
    const pct = `%${search}%`;
    whereParts.push(`(
      UPPER(NVL(v.EMPLOYEE_NUMBER,'')) LIKE UPPER(:search_1)
      OR UPPER(NVL(v.FIRST_NAME_EN,'')) LIKE UPPER(:search_2)
      OR UPPER(NVL(v.MIDDLE_NAME_EN,'')) LIKE UPPER(:search_3)
      OR UPPER(NVL(v.LAST_NAME_EN,'')) LIKE UPPER(:search_4)
      OR UPPER(NVL(v.EMAIL,'')) LIKE UPPER(:search_5)
      OR UPPER(NVL(v.PHONE_NUMBER,'')) LIKE UPPER(:search_6)
      OR UPPER(NVL(v.MOBILE_NUMBER,'')) LIKE UPPER(:search_7)
    )`);
    binds.search_1 = pct;
    binds.search_2 = pct;
    binds.search_3 = pct;
    binds.search_4 = pct;
    binds.search_5 = pct;
    binds.search_6 = pct;
    binds.search_7 = pct;
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
  const enterpriseId = params.enterprise_id != null ? Number(params.enterprise_id) : NaN;
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    const err = new Error('enterprise_id is required and must be a positive number');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const userId = params.user_id != null && params.user_id !== '' ? Number(params.user_id) : NaN;
  if (!Number.isFinite(userId) || userId < 1) {
    const err = new Error('user_id is required and must be a positive number');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(params.limit, 10) || DEFAULT_LIMIT));
  const cursor = decodeCursor(params.cursor) || { sort_by: params.sort_by || DEFAULT_SORT_BY, sort_dir: params.sort_dir || DEFAULT_SORT_DIR };

  const { whereParts, binds } = buildWhereAndBinds({ ...params, enterprise_id: enterpriseId, user_id: userId, limit });
  const { cursorCondition, orderBy, binds: cursorBinds } = buildCursorAndOrder(cursor, binds);
  Object.assign(binds, cursorBinds);

  const whereClause = whereParts.join(' AND ');
  // FNDSEC DB-level data access: JOIN ensures only employees the acting user is
  // authorized to access (per FNDSEC.FNDSEC_DATA_ACCESS_PKG.CAN_ACCESS_EMPLOYEE) are returned.
  const sql = `SELECT v.* FROM ${VIEW} v
  ${employeeAccessJoin('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':user_id')}
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
    const data = pageRows.map(normalizeRow);

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
