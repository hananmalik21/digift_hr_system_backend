/**
 * Attendance Logs Model
 * Reads from TM.V_ATTENDANCE_FULL (one row per attendance_day_id) with optional filters,
 * org tree (ENT.ORG_UNITS subtree), pagination (ROW_NUMBER), and sorting.
 */
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { paginateForExport } from '../../../../utils/excel/index.js';
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
const JSON_ARRAY_FIELDS = ['org_structure_list_json', 'org_structure_list'];

/**
 * Parse JSON string fields in a row: schedule_obj/actual_obj -> object;
 * org_structure_list / org_structure_list_json -> array (V_ATTENDANCE_FULL exposes ORG_STRUCTURE_LIST as CLOB/string JSON).
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
 * Build list query: base FROM TM.V_ATTENDANCE_FULL with optional filters.
 * levelCode + orgUnitId: same as timesheets API — JSON_EXISTS on ORG_STRUCTURE_LIST_JSON (employee's org list).
 * Returns { sql, countSql, binds }. Binds only include variables that appear in the SQL (avoids ORA-01036).
 */
function buildListQuery(filters, sortBy, sortDir) {
  const orderCol = (sortBy === 'employee_number') ? 'v.EMPLOYEE_NUMBER' : 'v.ATTENDANCE_DATE';
  const orderDir = (sortDir === 'ASC') ? 'ASC' : 'DESC';

  const hasOrgFilter = filters.levelCode != null && filters.orgUnitId != null;

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
  if (hasOrgFilter) {
    whereParts.push(`(
      :levelCode IS NULL
      OR :orgUnitId IS NULL
      OR JSON_EXISTS(
        v.ORG_STRUCTURE_LIST,
        '$[*]?(@.level_code == $lc && @.org_unit_id == $ou)'
        PASSING UPPER(:levelCode) AS "lc",
        :orgUnitId AS "ou"
      )
    )`);
  }

  const whereClause = whereParts.join(' AND ');
  const orderColName = orderCol.replace('v.', '');

  // Single query: total via COUNT(*) OVER (), paginate with OFFSET/FETCH (one round-trip)
  const listSql = `
    SELECT sub.* FROM (
      SELECT v.*, COUNT(*) OVER () AS total_count
      FROM ${VIEW} v
      WHERE ${whereClause}
    ) sub
    ORDER BY sub.${orderColName} ${orderDir}
    OFFSET (:page - 1) * :pageSize ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `;

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
    binds.levelCode = filters.levelCode;
    binds.orgUnitId = filters.orgUnitId;
  }

  return { listSql, binds, orderCol: orderColName, orderDir };
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

  const sortBy = (sort?.sortBy === 'employee_number') ? 'employee_number' : 'attendance_date';
  const sortDir = (String(sort?.sortDir || 'DESC').toUpperCase() === 'ASC') ? 'ASC' : 'DESC';

  const levelCode = optStr(filters.levelCode);
  const orgUnitId = optStr(filters.orgUnitId);

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
    levelCode: levelCode && levelCode.trim() !== '' ? levelCode.trim().toUpperCase() : null,
    orgUnitId: orgUnitId && orgUnitId.trim() !== '' ? orgUnitId.trim() : null
  };

  const { listSql, binds } = buildListQuery(normalizedFilters, sortBy, sortDir);
  const listBinds = { ...binds, page, pageSize };

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = TM`, [], { autoCommit: false });

    const result = await connection.execute(listSql, listBinds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: Math.max(pageSize, 100)
    });

    const rawRows = result.rows || [];
    const total = rawRows.length > 0 ? Number(rawRows[0].TOTAL_COUNT) : 0;
    const rows = rawRows.map((r) => {
      const row = { ...r };
      delete row.TOTAL_COUNT;
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
 * Fetch all attendance logs for Excel export (paginates internally).
 * @param {Object} filters
 * @param {Object} sort
 * @param {{ pageSize?: number, maxRows?: number }} [exportOptions]
 */
export async function getAttendanceLogsForExport(filters, sort = {}, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) => getAttendanceLogsList(
      filters,
      { page, pageSize },
      sort
    )
  });
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

