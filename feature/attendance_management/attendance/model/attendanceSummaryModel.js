/**
 * Attendance Summary Model
 * Reads from TM.V_ATTENDANCE_ACTUALS_EMP only (no joins to base tables).
 * Single SELECT with optional filters: enterprise_id (required), attendance_date / date_from/date_to,
 * employee_id, org_unit_id (tree via ORG_STRUCTURE_LIST), level_code (tree via ORG_STRUCTURE_LIST), attendance_status.
 */
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';

const VIEW = 'TM.V_ATTENDANCE_ACTUALS_EMP';

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
 * Parse date for Oracle bind (date only, YYYY-MM-DD).
 */
function parseDateOnly(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert row keys to snake_case; Buffer (RAW) to hex string.
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

/**
 * Parse JSON CLOB/string fields in row (e.g. ORG_STRUCTURE_LIST).
 */
function parseJsonFields(row, jsonFields = ['org_structure_list']) {
  if (row === null || row === undefined) return row;
  const out = { ...row };
  for (const key of jsonFields) {
    const val = out[key];
    if (typeof val === 'string' && val.trim() !== '') {
      try {
        out[key] = JSON.parse(val);
      } catch (_) {
        // keep as string if parse fails
      }
    }
  }
  return out;
}

/**
 * Build a single SELECT from TM.V_ATTENDANCE_ACTUALS_EMP with bind parameters.
 * - enterprise_id: required, always applied.
 * - attendance_date: single day; if provided, date_from/date_to are ignored.
 * - date_from, date_to: range; used only when attendance_date is not provided.
 * - employee_id, attendance_status: optional equality filters.
 * - org_unit_id: filter rows where org_unit_id exists in ORG_STRUCTURE_LIST (membership).
 * - level_code: filter rows where level_code exists in ORG_STRUCTURE_LIST (membership).
 * Uses ORG_STRUCTURE_LIST or ORG_STRUCTURE_LIST_JSON if present.
 */
function buildSummaryQuery(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterpriseId'];

  if (filters.attendanceDate != null) {
    whereParts.push('TRUNC(v.ATTENDANCE_DATE) = TO_DATE(:attendanceDate, \'YYYY-MM-DD\')');
  } else {
    if (filters.dateFrom != null) {
      whereParts.push('TRUNC(v.ATTENDANCE_DATE) >= TO_DATE(:dateFrom, \'YYYY-MM-DD\')');
    }
    if (filters.dateTo != null) {
      whereParts.push('TRUNC(v.ATTENDANCE_DATE) <= TO_DATE(:dateTo, \'YYYY-MM-DD\')');
    }
  }

  if (filters.employeeId != null) {
    whereParts.push('v.EMPLOYEE_ID = :employeeId');
  }
  if (filters.attendanceStatus != null) {
    whereParts.push('UPPER(v.ATTENDANCE_STATUS) = UPPER(:attendanceStatus)');
  }

  // Org tree: membership in ORG_STRUCTURE_LIST (view column; use only ORG_STRUCTURE_LIST per spec)
  const orgListCol = 'v.ORG_STRUCTURE_LIST';
  if (filters.orgUnitId != null) {
    whereParts.push(
      `JSON_EXISTS(${orgListCol}, '$[*]?(@.org_unit_id == $ou)' PASSING :orgUnitId AS "ou")`
    );
  }
  if (filters.levelCode != null) {
    whereParts.push(
      `JSON_EXISTS(${orgListCol}, '$[*]?(@.level_code == $lc)' PASSING UPPER(:levelCode) AS "lc")`
    );
  }

  const whereClause = whereParts.join(' AND ');
  const orderCol = 'v.ATTENDANCE_DATE';
  const orderDir = 'DESC';

  // Single query: total via COUNT(*) OVER (), paginate with OFFSET/FETCH (one round-trip)
  const sql = `
    SELECT sub.* FROM (
      SELECT v.*, COUNT(*) OVER () AS total_count
      FROM ${VIEW} v
      WHERE ${whereClause}
    ) sub
    ORDER BY sub.ATTENDANCE_DATE ${orderDir}
    OFFSET (:page - 1) * :pageSize ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `;

  const binds = { enterpriseId: filters.enterpriseId, page: filters.page, pageSize: filters.pageSize };
  if (filters.attendanceDate != null) binds.attendanceDate = filters.attendanceDate;
  else {
    if (filters.dateFrom != null) binds.dateFrom = filters.dateFrom;
    if (filters.dateTo != null) binds.dateTo = filters.dateTo;
  }
  if (filters.employeeId != null) binds.employeeId = filters.employeeId;
  if (filters.attendanceStatus != null) binds.attendanceStatus = filters.attendanceStatus;
  if (filters.orgUnitId != null) binds.orgUnitId = filters.orgUnitId;
  if (filters.levelCode != null) binds.levelCode = filters.levelCode;

  return { sql, binds };
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/**
 * Fetch paginated attendance summary rows from TM.V_ATTENDANCE_ACTUALS_EMP.
 * @param {Object} filters - enterpriseId (required), attendanceDate | dateFrom+dateTo, employeeId, orgUnitId, levelCode, attendanceStatus, page, pageSize
 * @returns {Promise<{ rows: Array, total: number }>} Rows (snake_case) and total count.
 */
export async function getAttendanceSummary(filters) {
  const enterpriseId = optNum(filters.enterprise_id ?? filters.enterpriseId);
  if (enterpriseId == null) {
    throw new DatabaseError('enterprise_id is required');
  }

  const attendanceDate = optStr(filters.attendance_date ?? filters.attendanceDate);
  const dateFrom = optStr(filters.date_from ?? filters.dateFrom);
  const dateTo = optStr(filters.date_to ?? filters.dateTo);
  const employeeId = optNum(filters.employee_id ?? filters.employeeId);
  const orgUnitId = optStr(filters.org_unit_id ?? filters.orgUnitId);
  const levelCode = optStr(filters.level_code ?? filters.levelCode);
  const attendanceStatus = optStr(filters.attendance_status ?? filters.attendanceStatus);
  const page = Math.max(1, optNum(filters.page) ?? DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, optNum(filters.page_size ?? filters.pageSize) ?? DEFAULT_PAGE_SIZE));

  const normalizedFilters = {
    enterpriseId,
    attendanceDate: attendanceDate ? parseDateOnly(attendanceDate) : null,
    dateFrom: dateFrom ? parseDateOnly(dateFrom) : null,
    dateTo: dateTo ? parseDateOnly(dateTo) : null,
    employeeId,
    orgUnitId: orgUnitId && orgUnitId.trim() !== '' ? orgUnitId.trim() : null,
    levelCode: levelCode && levelCode.trim() !== '' ? levelCode.trim().toUpperCase() : null,
    attendanceStatus: attendanceStatus && attendanceStatus.trim() !== '' ? attendanceStatus.trim() : null,
    page,
    pageSize
  };

  const { sql, binds } = buildSummaryQuery(normalizedFilters);

  let connection;
  try {
    connection = await db.getConnection();
    await connection.execute('ALTER SESSION SET CURRENT_SCHEMA = TM', [], { autoCommit: false });

    const result = await connection.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      fetchArraySize: Math.max(pageSize, 100)
    });

    const rawRows = result.rows || [];
    const total = rawRows.length > 0 ? Number(rawRows[0].TOTAL_COUNT) : 0;
    const rows = rawRows.map((r) => {
      const row = { ...r };
      delete row.TOTAL_COUNT;
      const snake = convertRowToSnakeCase(row);
      return parseJsonFields(snake, ['org_structure_list']);
    });

    return { rows, total };
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError(error.message || 'Failed to fetch attendance summary', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
