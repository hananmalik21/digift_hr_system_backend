/**
 * Attendance Logs Model
 * Reads from TM.V_ATTENDANCE_FULL (one row per attendance_day_id) with optional filters,
 * org tree (ENT.ORG_UNITS subtree), pagination (ROW_NUMBER), and sorting.
 */
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
const VIEW = 'TM.V_ATTENDANCE_FULL';

/**
 * Convert row keys from UPPER_CASE to snake_case; handle Buffer (RAW) as hex string.
 */
function convertRowToSnakeCase(row) {
  if (row === null || row === undefined) return row;
  const converted = {};
  for (const [key, value] of Object.entries(row)) {
    const newKey = key.toLowerCase();
    if (value instanceof Buffer) {
      converted[newKey] = value.toString('hex').toUpperCase();
    } else {
      converted[newKey] = value;
    }
  }
  return converted;
}

const JSON_OBJECT_FIELDS = ['schedule_obj', 'actual_obj'];
const JSON_ARRAY_FIELDS = ['org_structure_list_json'];

/**
 * Parse JSON string fields in a row: schedule_obj/actual_obj -> object, org_structure_list_json -> array.
 */
function parseJsonFields(row) {
  if (row === null || row === undefined) return row;
  const out = { ...row };
  for (const key of [...JSON_OBJECT_FIELDS, ...JSON_ARRAY_FIELDS]) {
    const val = out[key];
    if (typeof val === 'string' && val.trim() !== '') {
      try {
        out[key] = JSON.parse(val);
      } catch (_) {
        // keep as string if parse fails
      }
    } else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
      out[key] = val;
    }
  }
  return out;
}

function optNum(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function optStr(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Parse YYYY-MM-DD to Date for Oracle bind (date only).
 */
function parseDateOnly(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build list query: base FROM TM.V_ATTENDANCE_FULL with optional filters and org subtree.
 * Returns { sql, countSql, binds }. Binds only include variables that appear in the SQL (avoids ORA-01036).
 */
function buildListQuery(filters, sortBy, sortDir) {
  const orderCol = (sortBy === 'employee_number') ? 'v.EMPLOYEE_NUMBER' : 'v.ATTENDANCE_DATE';
  const orderDir = (sortDir === 'ASC') ? 'ASC' : 'DESC';

  const hasOrgFilter = filters.orgUnitId != null;

  const cte = hasOrgFilter
    ? `WITH org_start AS (
         SELECT org_unit_id FROM ent.org_units
         WHERE enterprise_id = :enterpriseId AND org_unit_id = :orgUnitId
           AND (:levelCode IS NULL OR UPPER(level_code) = UPPER(:levelCode))
       ),
       subtree AS (
         SELECT org_unit_id FROM ent.org_units
         WHERE enterprise_id = :enterpriseId
         START WITH org_unit_id IN (SELECT org_unit_id FROM org_start)
         CONNECT BY PRIOR org_unit_id = parent_org_unit_id
       )
       `
    : '';

  const whereParts = ['v.ENTERPRISE_ID = :enterpriseId'];
  if (filters.fromDate != null) whereParts.push('v.ATTENDANCE_DATE >= :fromDate');
  if (filters.toDate != null) whereParts.push('v.ATTENDANCE_DATE <= :toDate');
  if (filters.employeeNumber != null) whereParts.push('v.EMPLOYEE_NUMBER = :employeeNumber');
  if (filters.employeeId != null) whereParts.push('v.EMPLOYEE_ID = :employeeId');
  if (filters.attendanceStatus != null) whereParts.push('v.ATTENDANCE_STATUS = :attendanceStatus');
  if (filters.dayCategory != null) {
    whereParts.push(`EXISTS (
      SELECT 1 FROM TM.TM_ATTENDANCE_SCHEDULES s
      WHERE s.ATTENDANCE_DAY_ID = v.ATTENDANCE_DAY_ID AND s.DAY_CATEGORY = :dayCategory
    )`);
  }
  if (filters.inState != null) whereParts.push('v.IN_STATE = :inState');
  if (filters.outState != null) whereParts.push('v.OUT_STATE = :outState');
  if (filters.sourceType != null) whereParts.push('v.SOURCE_TYPE = :sourceType');
  if (hasOrgFilter) whereParts.push('v.ORG_UNIT_ID IN (SELECT org_unit_id FROM subtree)');

  const whereClause = whereParts.join(' AND ');
  const orderColName = orderCol.replace('v.', '');

  const innerSelect = `SELECT v.* FROM ${VIEW} v WHERE ${whereClause}`;
  const countSql = hasOrgFilter
    ? `${cte} SELECT COUNT(*) AS cnt FROM ${VIEW} v WHERE ${whereClause}`
    : `SELECT COUNT(*) AS cnt FROM ${VIEW} v WHERE ${whereClause}`;

  const sql = hasOrgFilter
    ? `${cte} SELECT * FROM (
         SELECT inner_q.*, ROW_NUMBER() OVER (ORDER BY inner_q.${orderColName} ${orderDir}) AS rn
         FROM (${innerSelect}) inner_q
       ) paginated
       WHERE rn BETWEEN :startRow AND :endRow`
    : `SELECT * FROM (
         SELECT inner_q.*, ROW_NUMBER() OVER (ORDER BY inner_q.${orderColName} ${orderDir}) AS rn
         FROM (${innerSelect}) inner_q
       ) paginated
       WHERE rn BETWEEN :startRow AND :endRow`;

  // Only include bind variables that are actually used in the SQL (avoids ORA-01036)
  const binds = { enterpriseId: filters.enterpriseId };
  if (filters.fromDate != null) binds.fromDate = filters.fromDate;
  if (filters.toDate != null) binds.toDate = filters.toDate;
  if (filters.employeeNumber != null) binds.employeeNumber = filters.employeeNumber;
  if (filters.employeeId != null) binds.employeeId = filters.employeeId;
  if (filters.attendanceStatus != null) binds.attendanceStatus = filters.attendanceStatus;
  if (filters.dayCategory != null) binds.dayCategory = filters.dayCategory;
  if (filters.inState != null) binds.inState = filters.inState;
  if (filters.outState != null) binds.outState = filters.outState;
  if (filters.sourceType != null) binds.sourceType = filters.sourceType;
  if (hasOrgFilter) {
    binds.orgUnitId = filters.orgUnitId;
    binds.levelCode = filters.levelCode ?? null;
  }

  return { sql, countSql, binds, orderCol: orderColName, orderDir };
}

/**
 * Fetch paginated attendance logs from TM.V_ATTENDANCE_FULL.
 * @param {Object} filters - enterpriseId (required), fromDate, toDate, employeeNumber, employeeId,
 *   attendanceStatus, dayCategory, inState, outState, sourceType, levelCode, orgUnitId
 * @param {Object} pagination - page (default 1), pageSize (default 25)
 * @param {Object} sort - sortBy ('attendance_date'|'employee_number'), sortDir ('ASC'|'DESC')
 * @returns {Promise<{ rows: Array, total: number }>}
 */
export async function getAttendanceLogsList(filters, pagination, sort) {
  const page = Math.max(1, optNum(pagination?.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, optNum(pagination?.pageSize) ?? 25));
  const startRow = (page - 1) * pageSize + 1;
  const endRow = page * pageSize;

  const sortBy = (sort?.sortBy === 'employee_number') ? 'employee_number' : 'attendance_date';
  const sortDir = (String(sort?.sortDir || 'DESC').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const normalizedFilters = {
    enterpriseId: filters.enterpriseId,
    fromDate: filters.fromDate != null ? parseDateOnly(filters.fromDate) : null,
    toDate: filters.toDate != null ? parseDateOnly(filters.toDate) : null,
    employeeNumber: optStr(filters.employeeNumber),
    employeeId: optNum(filters.employeeId),
    attendanceStatus: optStr(filters.attendanceStatus),
    dayCategory: optStr(filters.dayCategory),
    inState: optStr(filters.inState),
    outState: optStr(filters.outState),
    sourceType: optStr(filters.sourceType),
    levelCode: optStr(filters.levelCode),
    orgUnitId: optNum(filters.orgUnitId)
  };

  const { sql, countSql, binds } = buildListQuery(normalizedFilters, sortBy, sortDir);
  const dataBinds = { ...binds, startRow, endRow };

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = TM`, [], { autoCommit: false });

    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT }),
      connection.execute(sql, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT })
    ]);

    const total = countResult.rows?.[0]?.CNT != null ? Number(countResult.rows[0].CNT) : 0;
    const rows = (dataResult.rows || []).map((r) => {
      const row = { ...r };
      delete row.RN;
      return parseJsonFields(convertRowToSnakeCase(row));
    });

    return { rows, total };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(error.message || 'Failed to fetch attendance logs', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * Fetch a single attendance day by attendance_day_id from TM.V_ATTENDANCE_FULL.
 * @param {number} enterpriseId
 * @param {number} attendanceDayId
 * @returns {Promise<Object|null>} Single record (snake_case) or null
 */
export async function getAttendanceLogById(enterpriseId, attendanceDayId) {
  const eid = optNum(enterpriseId);
  const aid = optNum(attendanceDayId);
  if (eid == null || aid == null) return null;

  const sql = `
    SELECT * FROM ${VIEW}
    WHERE ENTERPRISE_ID = :enterpriseId AND ATTENDANCE_DAY_ID = :attendanceDayId
  `;
  const binds = { enterpriseId: eid, attendanceDayId: aid };

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = TM`, [], { autoCommit: false });
    const result = await connection.execute(sql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const row = result.rows?.[0];
    return row ? parseJsonFields(convertRowToSnakeCase(row)) : null;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(error.message || 'Failed to fetch attendance log', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
