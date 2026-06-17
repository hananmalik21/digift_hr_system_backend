/**
 * Attendance Summary Model
 * Reads from TM.V_ATTENDANCE_ACTUALS_EMP only (no joins to base tables).
 * Single SELECT with optional filters: enterprise_id (required), from_date, to_date (optional),
 * employee_id, org_unit_id (tree via ORG_STRUCTURE_LIST), level_code (tree via ORG_STRUCTURE_LIST), attendance_status.
 */
import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, ValidationError } from '../../../../utils/errors/index.js';
import { employeeAccessFunctionPredicate } from '../../../../utils/userContext.js';
import { paginateForExport } from '../../../../utils/excel/index.js';

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
 * - user_id: required, always applied as FNDSEC.CAN_ACCESS_EMPLOYEE predicate.
 * - from_date, to_date: optional; attendance_date >= :from_date AND attendance_date < :to_date + 1.
 *   If only from_date: single day (to_date = from_date). If both: date range. If neither: no date filter.
 * - employee_id, attendance_status: optional equality filters.
 * - org_unit_id: filter rows where org_unit_id exists in ORG_STRUCTURE_LIST (membership).
 * - level_code: filter rows where level_code exists in ORG_STRUCTURE_LIST (membership).
 * No filter on employment_status or employee_status.
 */
function buildSummaryQuery(filters) {
  const whereParts = ['v.ENTERPRISE_ID = :enterpriseId'];
  const accessOptions = filters.bypassEmployeeAccess ? { bypass: true } : undefined;

  whereParts.push(
    employeeAccessFunctionPredicate('v.ENTERPRISE_ID', 'v.EMPLOYEE_ID', ':userId', accessOptions)
  );

  if (filters.fromDate != null) {
    whereParts.push('v.ATTENDANCE_DATE >= TO_DATE(:fromDate, \'YYYY-MM-DD\')');
    whereParts.push('v.ATTENDANCE_DATE < TO_DATE(:toDate, \'YYYY-MM-DD\') + 1');
  }

  if (filters.employeeId != null) {
    whereParts.push('v.EMPLOYEE_ID = :employeeId');
  }
  if (filters.attendanceStatus != null) {
    whereParts.push('UPPER(v.ATTENDANCE_STATUS) = UPPER(:attendanceStatus)');
  }

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
  const orderDir = 'DESC';

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

  const binds = {
    enterpriseId: filters.enterpriseId,
    userId: filters.userId,
    page: filters.page,
    pageSize: filters.pageSize
  };
  if (filters.fromDate != null) {
    binds.fromDate = filters.fromDate;
    binds.toDate = filters.toDate != null ? filters.toDate : filters.fromDate;
  }
  if (filters.employeeId != null) binds.employeeId = filters.employeeId;
  if (filters.attendanceStatus != null) binds.attendanceStatus = filters.attendanceStatus;
  if (filters.orgUnitId != null) binds.orgUnitId = filters.orgUnitId;
  if (filters.levelCode != null) binds.levelCode = filters.levelCode;

  return { sql, binds };
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

/**
 * Fetch paginated attendance summary rows from TM.V_ATTENDANCE_ACTUALS_EMP.
 * @param {Object} filters - enterpriseId (required), from_date, to_date (optional), employeeId, orgUnitId, levelCode, attendanceStatus, page, pageSize
 * @returns {Promise<{ rows: Array, total: number, page: number, pageSize: number }>} Rows (snake_case), total count, and pagination used.
 */
export async function getAttendanceSummary(filters) {
  const enterpriseId = optNum(filters.enterprise_id ?? filters.enterpriseId);
  if (enterpriseId == null) {
    throw new DatabaseError('enterprise_id is required');
  }

  const userId = optNum(filters.user_id ?? filters.userId);
  if (userId == null || userId < 1) {
    throw new ValidationError('Validation failed', ['user_id is required and must be a positive number']);
  }

  const fromDateRaw = optStr(filters.from_date ?? filters.fromDate ?? filters.date_from ?? filters.dateFrom ?? filters.attendance_date ?? filters.attendanceDate);
  const toDateRaw = optStr(filters.to_date ?? filters.toDate ?? filters.date_to ?? filters.dateTo);
  const fromDate = fromDateRaw ? parseDateOnly(fromDateRaw) : null;
  const toDate = toDateRaw ? parseDateOnly(toDateRaw) : null;

  if (fromDateRaw != null && fromDate == null) {
    throw new ValidationError('Validation failed', ['Invalid date format for from_date (use YYYY-MM-DD)']);
  }
  if (toDateRaw != null && toDate == null) {
    throw new ValidationError('Validation failed', ['Invalid date format for to_date (use YYYY-MM-DD)']);
  }

  const employeeId = optNum(filters.employee_id ?? filters.employeeId);
  const orgUnitId = optStr(filters.org_unit_id ?? filters.orgUnitId);
  const levelCode = optStr(filters.level_code ?? filters.levelCode);
  const attendanceStatus = optStr(filters.attendance_status ?? filters.attendanceStatus);
  const page = Math.max(1, optNum(filters.page) ?? DEFAULT_PAGE);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, optNum(filters.page_size ?? filters.pageSize) ?? DEFAULT_PAGE_SIZE));

  const normalizedFilters = {
    enterpriseId,
    userId,
    fromDate,
    toDate,
    employeeId,
    orgUnitId: orgUnitId || null,
    levelCode: levelCode ? levelCode.toUpperCase() : null,
    attendanceStatus: attendanceStatus || null,
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
      fetchArraySize: pageSize
    });

    const rawRows = result.rows || [];
    const total = rawRows.length > 0 ? Number(rawRows[0].TOTAL_COUNT) : 0;
    const rows = rawRows.map((r) => {
      const snake = convertRowToSnakeCase(r);
      delete snake.total_count;
      return parseJsonFields(snake, ['org_structure_list']);
    });

    return { rows, total, page, pageSize };
  } catch (error) {
    if (error instanceof DatabaseError || error instanceof ValidationError) throw error;
    throw new DatabaseError(error.message || 'Failed to fetch attendance summary', error);
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * Fetch all attendance summary rows for Excel export (paginates internally).
 * @param {Object} filters
 * @param {{ pageSize?: number, maxRows?: number }} [exportOptions]
 */
export async function getAttendanceSummaryForExport(filters, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) => getAttendanceSummary({
      ...filters,
      page,
      page_size: pageSize
    })
  });
}
