import db from '../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError } from '../../../utils/errors/index.js';

const SCHEMA = 'TM';
const STATUS_CODES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'];
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const HEADER_DATE_KEYS = ['WEEK_START_DATE', 'WEEK_END_DATE', 'SUBMITTED_DATE', 'APPROVED_DATE', 'REJECTED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE'];
const GUID_HEX_LEN = 32;
const GUID_HEX_REGEX = /^[0-9A-Fa-f]{32}$/;

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

function dateToOracle(dateObj) {
  if (dateObj == null) return null;
  if (dateObj instanceof Date) return dateObj;
  const d = new Date(dateObj);
  return Number.isFinite(d.getTime()) ? d : null;
}

function hexStringToBuffer(hexStr) {
  if (hexStr == null || typeof hexStr !== 'string') return null;
  const hex = String(hexStr).replace(/-/g, '').trim();
  if (hex.length === 0 || hex.length !== GUID_HEX_LEN || !GUID_HEX_REGEX.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function normalizeGuidString(hexStr) {
  if (hexStr == null || typeof hexStr !== 'string') return null;
  const hex = String(hexStr).replace(/-/g, '').trim();
  return hex.length === GUID_HEX_LEN && GUID_HEX_REGEX.test(hex) ? hex.toUpperCase() : null;
}

function bufferToHexString(buf) {
  if (buf == null) return null;
  if (Buffer.isBuffer(buf)) return buf.toString('hex').toUpperCase();
  return null;
}

function outVal(bind) {
  if (!bind || typeof bind !== 'object') return null;
  const v = bind.val;
  if (v === undefined || v === null) return null;
  if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v.trim() || null;
  return v;
}

function formatDateKey(row, key) {
  if (row[key] instanceof Date) row[key] = row[key].toISOString().slice(0, 10);
}

function mapHeaderRow(row) {
  if (!row) return null;
  const r = { ...row };
  if (Buffer.isBuffer(r.TIMESHEET_GUID)) r.TIMESHEET_GUID = bufferToHexString(r.TIMESHEET_GUID);
  HEADER_DATE_KEYS.forEach((k) => formatDateKey(r, k));
  return r;
}

function mapLineRow(row) {
  if (!row) return null;
  const r = { ...row };
  if (Buffer.isBuffer(r.LINE_GUID)) r.LINE_GUID = bufferToHexString(r.LINE_GUID);
  formatDateKey(r, 'WORK_DATE');
  return r;
}

async function runWithTransaction(fn, errorContext = 'complete operation') {
  const connection = await db.getConnection();
  try {
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`, [], { autoCommit: false });
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    const userMsg = mapTimesheetOracleError(err);
    if (userMsg) throw new DatabaseError(userMsg, err, userMsg);
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError(`Failed to ${errorContext}.`, err);
  } finally {
    try { await connection.close(); } catch (_) {}
  }
}

async function runReadOnly(fn) {
  const connection = await db.getConnection();
  try {
    await connection.execute(`ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`, [], { autoCommit: true });
    return await fn(connection);
  } finally {
    try { await connection.close(); } catch (_) {}
  }
}

/**
 * Map Oracle error to user-friendly message. ORA-20000 → validation; ORA-02291 → FK; ORA-00001 → duplicate.
 */
function mapTimesheetOracleError(err) {
  if (!err || typeof err.message !== 'string') return null;
  const msg = err.message.toUpperCase();
  const constraint = (err.message.match(/\(([A-Z0-9_.]+)\)/) || [])[1] || '';
  if (err.errorNum === 1 || msg.includes('ORA-00001')) {
    return 'Duplicate record.';
  }
  if (err.errorNum === 2291 || msg.includes('ORA-02291')) {
    if (constraint.includes('FK_TM_TSL_PROJECT')) return 'Invalid project_id. Parent record not found.';
    if (constraint.includes('FK_TM_TSL_TASK')) return 'Invalid task_id. Parent record not found.';
    return 'Invalid project_id/task_id. Parent record not found.';
  }
  if (err.errorNum === 2292 || msg.includes('ORA-02292')) {
    return 'Cannot delete: record is referenced by other records.';
  }
  if ((err.errorNum >= 20000 && err.errorNum <= 20999) || msg.includes('ORA-20')) {
    const firstLine = err.message.split(/\n/)[0].trim();
    return firstLine.replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim() || null;
  }
  return null;
}

/** Get current timesheet status (for DRAFT-only line modification pre-check). Returns STATUS_CODE or null. */
export async function getTimesheetStatus(timesheetId) {
  return runReadOnly(async (conn) => {
    const result = await conn.execute(
      'SELECT STATUS_CODE FROM TM.TM_TIMESHEETS WHERE TIMESHEET_ID = :tid',
      { tid: timesheetId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    return row?.STATUS_CODE ?? null;
  });
}

/** Resolve timesheet GUID (32-char hex, dashes optional) to timesheet_id. Returns null if not found. */
export async function getTimesheetIdByGuid(timesheetGuid) {
  const buf = hexStringToBuffer(timesheetGuid);
  if (!buf) return null;
  return runReadOnly(async (conn) => {
    const result = await conn.execute(
      'SELECT TIMESHEET_ID FROM TM.TM_TIMESHEETS WHERE TIMESHEET_GUID = :g',
      { g: buf },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    return row?.TIMESHEET_ID ?? null;
  });
}

/** Resolve timesheet GUID to id and status in one round-trip. Returns { id, status_code } or null. */
export async function getTimesheetIdAndStatusByGuid(timesheetGuid) {
  const buf = hexStringToBuffer(timesheetGuid);
  if (!buf) return null;
  return runReadOnly(async (conn) => {
    const result = await conn.execute(
      'SELECT TIMESHEET_ID, STATUS_CODE FROM TM.TM_TIMESHEETS WHERE TIMESHEET_GUID = :g',
      { g: buf },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return { id: row.TIMESHEET_ID, status_code: row.STATUS_CODE };
  });
}

/** Resolve line GUID to line_id within a timesheet. Returns null if not found. */
export async function getLineIdByGuid(timesheetId, lineGuid) {
  const buf = hexStringToBuffer(lineGuid);
  if (!buf) return null;
  return runReadOnly(async (conn) => {
    const result = await conn.execute(
      'SELECT LINE_ID FROM TM.TM_TIMESHEET_LINES WHERE TIMESHEET_ID = :tid AND LINE_GUID = :g',
      { tid: timesheetId, g: buf },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = result.rows?.[0];
    return row?.LINE_ID ?? null;
  });
}

/** Get timesheet status by timesheet GUID. Returns STATUS_CODE or null. */
export async function getTimesheetStatusByGuid(timesheetGuid) {
  const id = await getTimesheetIdByGuid(timesheetGuid);
  return id != null ? await getTimesheetStatus(id) : null;
}

/** Get single timesheet by GUID (resolves to id then fetches). */
export async function getTimesheetByGuid(timesheetGuid) {
  const id = await getTimesheetIdByGuid(timesheetGuid);
  return id != null ? await getTimesheetById(null, id) : null;
}

/** Delete line by timesheet GUID and line GUID. Resolves to IDs then calls DELETE_LINE. */
export async function deleteLineByGuid(timesheetGuid, lineGuid, updatedBy) {
  const timesheetId = await getTimesheetIdByGuid(timesheetGuid);
  if (timesheetId == null) throw new NotFoundError('Timesheet not found');
  return deleteLineByResolvedId(timesheetId, lineGuid, updatedBy);
}

/** Delete line when timesheet ID already resolved (saves one round-trip when caller has id). */
export async function deleteLineByResolvedId(timesheetId, lineGuid, updatedBy) {
  const lineId = await getLineIdByGuid(timesheetId, lineGuid);
  if (lineId == null) throw new NotFoundError('Line not found');
  return deleteLine(timesheetId, lineId, updatedBy);
}

/**
 * UPSERT weekly timesheet: TM.TM_TIMESHEET_PKG.UPSERT_WEEKLY_TIMESHEET
 * Creates or updates header and lines. timesheet_id null = create; else update.
 */
export async function upsertWeeklyTimesheet(payload) {
  const enterpriseId = optNum(payload.enterprise_id);
  const employeeId = optNum(payload.employee_id);
  const weekStart = payload.week_start_date;
  const weekEnd = payload.week_end_date;
  const statusCode = optStr(payload.status_code) || 'DRAFT';
  const projectName = optStr(payload.project_name);
  const description = optStr(payload.description);
  const attendanceWeekRef = optStr(payload.attendance_week_ref);
  const rejectReason = optStr(payload.reject_reason);
  const isActive = optStr(payload.is_active) || 'Y';
  const createdBy = optStr(payload.created_by);
  const updatedBy = optStr(payload.updated_by);
  const timesheetIdIn = optNum(payload.timesheet_id);
  const timesheetGuidStr = optStr(payload.timesheet_guid);
  const lines = payload.lines;
  const linesForJson = Array.isArray(lines)
    ? lines.map((line) => {
        const { line_guid, ...rest } = line;
        const out = { ...rest };
        const normalized = normalizeGuidString(line_guid);
        if (normalized) out.line_guid = normalized;
        return out;
      })
    : [];
  const linesJson = JSON.stringify(linesForJson);
  const timesheetGuidBuffer = timesheetGuidStr ? hexStringToBuffer(timesheetGuidStr) : null;

  const timesheetIdBind = {
    type: oracledb.NUMBER,
    dir: oracledb.BIND_INOUT,
    val: timesheetIdIn
  };
  const timesheetGuidBind = {
    type: oracledb.BUFFER,
    dir: oracledb.BIND_INOUT,
    maxSize: 16,
    val: timesheetGuidBuffer
  };

  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.UPSERT_WEEKLY_TIMESHEET(
        p_enterprise_id        => :p_enterprise_id,
        p_employee_id          => :p_employee_id,
        p_week_start_date      => :p_week_start_date,
        p_week_end_date        => :p_week_end_date,
        p_status_code          => :p_status_code,
        p_project_name         => :p_project_name,
        p_description          => :p_description,
        p_attendance_week_ref   => :p_attendance_week_ref,
        p_reject_reason        => :p_reject_reason,
        p_is_active            => :p_is_active,
        p_created_by           => :p_created_by,
        p_updated_by           => :p_updated_by,
        p_timesheet_id         => :p_timesheet_id,
        p_timesheet_guid       => :p_timesheet_guid,
        p_lines_json           => :p_lines_json
      );
    END;
  `;

  const binds = {
    p_enterprise_id: enterpriseId,
    p_employee_id: employeeId,
    p_week_start_date: dateToOracle(weekStart),
    p_week_end_date: dateToOracle(weekEnd),
    p_status_code: statusCode,
    p_project_name: projectName,
    p_description: description,
    p_attendance_week_ref: attendanceWeekRef,
    p_reject_reason: rejectReason,
    p_is_active: isActive,
    p_created_by: createdBy,
    p_updated_by: updatedBy,
    p_timesheet_id: timesheetIdBind,
    p_timesheet_guid: timesheetGuidBind,
    p_lines_json: { type: oracledb.CLOB, dir: oracledb.BIND_IN, val: linesJson }
  };

  const returnFull = payload.returnFull !== false;

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    const outId = outVal(timesheetIdBind);
    const outGuid = outVal(timesheetGuidBind) || bufferToHexString(timesheetGuidBind.val);
    const base = { timesheet_id: outId, timesheet_guid: outGuid, status_code: statusCode };
    if (!returnFull) return base;
    const header = await getTimesheetById(connection, outId);
    return { ...base, ...(header && { header, lines: header.lines }) };
  }, 'upsert timesheet');
}

/**
 * Submit: TM.TM_TIMESHEET_PKG.SUBMIT_TIMESHEET(timesheet_id, submitted_date, updated_by)
 * @param {Object} [options] - options.returnFull (default true) to skip re-fetch and return minimal
 */
export async function submitTimesheet(timesheetId, payload, options = {}) {
  const returnFull = options.returnFull !== false;
  const updatedBy = optStr(payload.updated_by);
  const submittedDate = payload.submitted_date != null ? dateToOracle(payload.submitted_date) : null;

  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.SUBMIT_TIMESHEET(
        p_timesheet_id    => :p_timesheet_id,
        p_submitted_date  => :p_submitted_date,
        p_updated_by      => :p_updated_by
      );
    END;
  `;

  const binds = {
    p_timesheet_id: timesheetId,
    p_submitted_date: submittedDate,
    p_updated_by: updatedBy
  };

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    if (!returnFull) return { timesheet_id: timesheetId, status_code: 'SUBMITTED' };
    return getTimesheetById(connection, timesheetId);
  }, 'submit timesheet');
}

/**
 * Approve: TM.TM_TIMESHEET_PKG.APPROVE_TIMESHEET(timesheet_id, approved_date, updated_by)
 * @param {Object} [options] - options.returnFull (default true) to skip re-fetch
 */
export async function approveTimesheet(timesheetId, payload, options = {}) {
  const returnFull = options.returnFull !== false;
  const updatedBy = optStr(payload.updated_by);
  const approvedDate = payload.approved_date != null ? dateToOracle(payload.approved_date) : null;

  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.APPROVE_TIMESHEET(
        p_timesheet_id   => :p_timesheet_id,
        p_approved_date  => :p_approved_date,
        p_updated_by     => :p_updated_by
      );
    END;
  `;

  const binds = {
    p_timesheet_id: timesheetId,
    p_approved_date: approvedDate,
    p_updated_by: updatedBy
  };

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    if (!returnFull) return { timesheet_id: timesheetId, status_code: 'APPROVED' };
    return getTimesheetById(connection, timesheetId);
  }, 'approve timesheet');
}

/**
 * Reject: TM.TM_TIMESHEET_PKG.REJECT_TIMESHEET(timesheet_id, rejected_date, reject_reason, updated_by)
 * @param {Object} [options] - options.returnFull (default true) to skip re-fetch
 */
export async function rejectTimesheet(timesheetId, payload, options = {}) {
  const returnFull = options.returnFull !== false;
  const updatedBy = optStr(payload.updated_by);
  const rejectReason = optStr(payload.reject_reason);
  const rejectedDate = payload.rejected_date != null ? dateToOracle(payload.rejected_date) : null;

  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.REJECT_TIMESHEET(
        p_timesheet_id   => :p_timesheet_id,
        p_rejected_date  => :p_rejected_date,
        p_reject_reason  => :p_reject_reason,
        p_updated_by     => :p_updated_by
      );
    END;
  `;

  const binds = {
    p_timesheet_id: timesheetId,
    p_rejected_date: rejectedDate,
    p_reject_reason: rejectReason,
    p_updated_by: updatedBy
  };

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    if (!returnFull) return { timesheet_id: timesheetId, status_code: 'REJECTED' };
    return getTimesheetById(connection, timesheetId);
  }, 'reject timesheet');
}

/**
 * Delete full timesheet: TM.TM_TIMESHEET_PKG.DELETE_TIMESHEET(p_timesheet_id, p_updated_by)
 * DB behavior: DRAFT → physical delete; SUBMITTED → status becomes WITHDRAWN; APPROVED/REJECTED → raises; WITHDRAWN → cannot delete again.
 */
export async function deleteTimesheet(timesheetId, updatedBy) {
  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.DELETE_TIMESHEET(
        p_timesheet_id => :p_timesheet_id,
        p_updated_by   => :p_updated_by
      );
    END;
  `;
  const binds = {
    p_timesheet_id: timesheetId,
    p_updated_by: optStr(updatedBy)
  };

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    return { timesheet_id: timesheetId };
  }, 'delete timesheet');
}

/**
 * Delete timesheet by GUID (resolves to id then calls DELETE_TIMESHEET).
 */
export async function deleteTimesheetByGuid(timesheetGuid, updatedBy) {
  const timesheetId = await getTimesheetIdByGuid(timesheetGuid);
  if (timesheetId == null) throw new NotFoundError('Timesheet not found');
  return deleteTimesheet(timesheetId, updatedBy);
}

/**
 * Delete line: TM.TM_TIMESHEET_PKG.DELETE_LINE(timesheet_id, line_id, updated_by)
 */
export async function deleteLine(timesheetId, lineId, updatedBy) {
  const plsql = `
    BEGIN
      TM.TM_TIMESHEET_PKG.DELETE_LINE(
        p_timesheet_id => :p_timesheet_id,
        p_line_id      => :p_line_id,
        p_updated_by   => :p_updated_by
      );
    END;
  `;

  const binds = {
    p_timesheet_id: timesheetId,
    p_line_id: lineId,
    p_updated_by: optStr(updatedBy)
  };

  return runWithTransaction(async (connection) => {
    await connection.execute(plsql, binds, { autoCommit: false });
    return { timesheet_id: timesheetId, line_id: lineId, deleted: true };
  }, 'delete timesheet line');
}

/**
 * Get single timesheet by id with lines (uses existing connection or new one).
 */
export async function getTimesheetById(connection, timesheetId) {
  const owned = !connection;
  if (!connection) connection = await db.getConnection();
  try {
    const headerSql = `
      SELECT TIMESHEET_ID, TIMESHEET_GUID, ENTERPRISE_ID, EMPLOYEE_ID,
             WEEK_START_DATE, WEEK_END_DATE, STATUS_CODE, PROJECT_NAME, DESCRIPTION,
             ATTENDANCE_WEEK_REF, REJECT_REASON, SUBMITTED_DATE, APPROVED_DATE, REJECTED_DATE,
             IS_ACTIVE, CREATION_DATE, CREATED_BY, LAST_UPDATE_DATE, LAST_UPDATED_BY
      FROM TM.TM_TIMESHEETS
      WHERE TIMESHEET_ID = :tid
    `;
    const headerResult = await connection.execute(headerSql, { tid: timesheetId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const headerRow = headerResult.rows && headerResult.rows[0];
    if (!headerRow) return null;

    const linesSql = `
      SELECT LINE_ID, LINE_GUID, TIMESHEET_ID, WORK_DATE, PROJECT_ID, TASK_ID,
             PROJECT_TASK_TEXT, REGULAR_HOURS, OT_HOURS, LINE_NOTES
      FROM TM.TM_TIMESHEET_LINES
      WHERE TIMESHEET_ID = :tid
      ORDER BY WORK_DATE, LINE_ID
    `;
    const linesResult = await connection.execute(linesSql, { tid: timesheetId }, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const lines = (linesResult.rows || []).map(mapLineRow);

    const header = mapHeaderRow(headerRow);
    return keysToSnake({ ...header, lines });
  } finally {
    if (owned && connection) try { await connection.close(); } catch (_) {}
  }
}

const SORT_BY_WHITELIST = new Set(['WEEK_START_DATE', 'WEEK_END_DATE', 'STATUS_CODE', 'PROJECT_NAME', 'EMPLOYEE_NUMBER', 'TIMESHEET_ID']);
const SORT_DIR_WHITELIST = new Set(['ASC', 'DESC']);

function safeParseJsonClob(val, defaultVal = []) {
  if (val == null) return defaultVal;
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    const s = val.trim();
    if (s === '') return defaultVal;
    try {
      const parsed = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : defaultVal;
    } catch (_) {
      return defaultVal;
    }
  }
  return defaultVal;
}

/**
 * Convert a single key to lowercase snake_case.
 * UPPER_SNAKE (Oracle) -> lower; camelCase -> snake_case.
 */
function toSnakeKey(key) {
  const s = String(key);
  if (/^[A-Z0-9_]+$/.test(s)) return s.toLowerCase();
  return s
    .replace(/([A-Z])/g, (_, c) => '_' + c.toLowerCase())
    .replace(/^_/, '')
    .replace(/_+/g, '_');
}

/**
 * Recursively convert object keys to snake_case (for API responses).
 */
function keysToSnake(obj) {
  if (obj == null) return obj;
  if (obj instanceof Date || Buffer.isBuffer(obj)) return obj;
  if (Array.isArray(obj)) return obj.map((item) => keysToSnake(item));
  if (typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = toSnakeKey(k);
    out[snakeKey] = keysToSnake(v);
  }
  return out;
}

function mapViewRow(row) {
  if (!row) return null;
  const r = { ...row };
  if (Buffer.isBuffer(r.TIMESHEET_GUID)) r.TIMESHEET_GUID = bufferToHexString(r.TIMESHEET_GUID);
  if (Buffer.isBuffer(r.ORG_UNIT_ID)) r.ORG_UNIT_ID = bufferToHexString(r.ORG_UNIT_ID);
  HEADER_DATE_KEYS.forEach((k) => formatDateKey(r, k));
  const linesFromJson = safeParseJsonClob(r.TIMESHEET_LINES_JSON, []);
  const linesFromClob = safeParseJsonClob(r.TIMESHEET_LINES, []);
  r.TIMESHEET_LINES = Array.isArray(linesFromClob) && linesFromClob.length > 0 ? linesFromClob : linesFromJson;
  delete r.TIMESHEET_LINES_JSON;
  r.ORG_STRUCTURE_LIST = safeParseJsonClob(r.ORG_STRUCTURE_LIST, []);
  const orgJson = safeParseJsonClob(r.ORG_STRUCTURE_LIST_JSON, []);
  if (orgJson.length > 0) r.ORG_STRUCTURE_LIST = orgJson;
  delete r.ORG_STRUCTURE_LIST_JSON;
  r.TIMESHEET_LINES = r.TIMESHEET_LINES.map((line) => {
    const lineObj = { ...line };
    const guidKey = lineObj.TIMESHEET_LINE_GUID != null ? 'TIMESHEET_LINE_GUID' : 'timesheet_line_guid';
    if (Buffer.isBuffer(lineObj[guidKey])) lineObj[guidKey] = bufferToHexString(lineObj[guidKey]);
    if (typeof lineObj.work_date === 'string' && lineObj.work_date.length >= 10) lineObj.work_date = lineObj.work_date.slice(0, 10);
    if (typeof lineObj.WORK_DATE === 'string' && lineObj.WORK_DATE.length >= 10) lineObj.WORK_DATE = lineObj.WORK_DATE.slice(0, 10);
    return lineObj;
  });
  return keysToSnake(r);
}

/**
 * List timesheets from TM.V_TIMESHEETS_WITH_LINES_JSON with filters, sort, pagination.
 */
export async function listTimesheetsFromView(filters) {
  const enterpriseId = optNum(filters.enterpriseId ?? filters.enterprise_id);
  const orgUnitId = filters.orgUnitId ?? filters.org_unit_id;
  const levelCode = filters.levelCode ?? filters.level_code;
  const status = optStr(filters.status ?? filters.status_code);
  const projectName = optStr(filters.projectName ?? filters.project_name);
  const search = optStr(filters.search);
  const weekStartFrom = filters.weekStartFrom ?? filters.week_start_from;
  const weekStartTo = filters.weekStartTo ?? filters.week_start_to;
  const page = Math.max(1, parseInt(filters.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(filters.limit, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  const rawSortBy = String(filters.sortBy ?? 'WEEK_START_DATE').toUpperCase();
  const sortBy = SORT_BY_WHITELIST.has(rawSortBy) ? rawSortBy : 'WEEK_START_DATE';
  const rawSortDir = String(filters.sortDir ?? 'DESC').toUpperCase();
  const sortDir = SORT_DIR_WHITELIST.has(rawSortDir) ? rawSortDir : 'DESC';

  const conditions = ['v.ENTERPRISE_ID = :enterpriseId'];
  const binds = { enterpriseId };

  if (orgUnitId != null && String(orgUnitId).trim() !== '' && levelCode != null && String(levelCode).trim() !== '') {
    conditions.push(
      `JSON_EXISTS(v.ORG_STRUCTURE_LIST, 'lax $[*]?(@.org_unit_id == $ouid && @.level_code == $lcode)' PASSING :orgUnitId AS "ouid", :levelCode AS "lcode")`
    );
    binds.orgUnitId = String(orgUnitId).trim();
    binds.levelCode = String(levelCode).trim().toUpperCase();
  }

  if (status != null) {
    conditions.push('UPPER(v.STATUS_CODE) = UPPER(:status)');
    binds.status = status;
  }
  if (projectName != null) {
    conditions.push("UPPER(v.PROJECT_NAME) LIKE '%' || UPPER(:projectName) || '%'");
    binds.projectName = projectName;
  }
  if (search != null) {
    conditions.push("v.SEARCH_KEY LIKE '%' || UPPER(:search) || '%'");
    binds.search = search;
  }
  if (weekStartFrom != null && String(weekStartFrom).trim() !== '') {
    conditions.push("v.WEEK_START_DATE >= TO_DATE(:weekStartFrom,'YYYY-MM-DD')");
    binds.weekStartFrom = String(weekStartFrom).slice(0, 10);
  }
  if (weekStartTo != null && String(weekStartTo).trim() !== '') {
    conditions.push("v.WEEK_START_DATE <= TO_DATE(:weekStartTo,'YYYY-MM-DD')");
    binds.weekStartTo = String(weekStartTo).slice(0, 10);
  }

  const whereClause = conditions.join(' AND ');
  const orderBy = `${sortBy} ${sortDir}`;
  const dataBinds = { ...binds, p_offset: offset, p_limit: limit };

  const listSql = `
    SELECT * FROM (
      SELECT v.*,
             COUNT(*) OVER () AS total_count,
             ROW_NUMBER() OVER (ORDER BY v.${sortBy} ${sortDir}) AS rn
      FROM TM.V_TIMESHEETS_WITH_LINES_JSON v
      WHERE ${whereClause}
    ) WHERE rn > :p_offset AND rn <= :p_offset + :p_limit
    ORDER BY rn
  `;

  try {
    return await runReadOnly(async (connection) => {
      const result = await connection.execute(listSql, dataBinds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = result.rows || [];
      const totalRecords = rows.length > 0 ? Number(rows[0].TOTAL_COUNT) || 0 : 0;
      const data = rows.map((row) => {
        const { RN, TOTAL_COUNT: _tc, ...rest } = row;
        return mapViewRow(rest);
      });
      const totalPages = limit > 0 ? Math.ceil(totalRecords / limit) : 0;
      return { data, total_count: totalRecords, page, limit, totalPages };
    });
  } catch (err) {
    const userMsg = mapTimesheetOracleError(err);
    if (userMsg) throw new DatabaseError(userMsg, err, userMsg);
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError('Failed to list timesheets.', err);
  }
}

/**
 * List timesheets with filters and pagination (OFFSET/FETCH, total_count) — table-based.
 */
export async function listTimesheets(filters) {
  const enterpriseId = optNum(filters.enterprise_id);
  const employeeId = optNum(filters.employee_id);
  const statusCode = optStr(filters.status_code);
  const weekStartFrom = filters.week_start_from;
  const weekStartTo = filters.week_start_to;
  const page = Math.max(1, parseInt(filters.page, 10) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(filters.limit, 10) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  const conditions = ['ENTERPRISE_ID = :enterprise_id'];
  const binds = { enterprise_id: enterpriseId };

  if (employeeId != null) {
    conditions.push('EMPLOYEE_ID = :employee_id');
    binds.employee_id = employeeId;
  }
  if (statusCode != null) {
    conditions.push('STATUS_CODE = :status_code');
    binds.status_code = statusCode;
  }
  if (weekStartFrom != null && weekStartFrom !== '') {
    conditions.push('WEEK_START_DATE >= TO_DATE(:week_start_from, \'YYYY-MM-DD\')');
    binds.week_start_from = String(weekStartFrom).slice(0, 10);
  }
  if (weekStartTo != null && weekStartTo !== '') {
    conditions.push('WEEK_START_DATE <= TO_DATE(:week_start_to, \'YYYY-MM-DD\')');
    binds.week_start_to = String(weekStartTo).slice(0, 10);
  }

  const whereClause = conditions.join(' AND ');
  binds.offset = offset;
  binds.offset_plus_limit = offset + limit;

  const listSql = `
    SELECT * FROM (
      SELECT t.*,
             COUNT(*) OVER () AS total_count,
             ROW_NUMBER() OVER (ORDER BY t.WEEK_START_DATE DESC, t.TIMESHEET_ID DESC) AS rn
      FROM TM.TM_TIMESHEETS t
      WHERE ${whereClause}
    )
    WHERE rn > :offset AND rn <= :offset_plus_limit
  `;

  try {
    return await runReadOnly(async (connection) => {
      const result = await connection.execute(listSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
      const rows = result.rows || [];
      const totalCount = rows.length > 0 ? Number(rows[0].TOTAL_COUNT) || 0 : 0;
      const data = rows.map((row) => {
        const { RN, TOTAL_COUNT: _tc, ...rest } = row;
        return mapHeaderRow(rest);
      });
      return { data, total_count: totalCount, page, limit };
    });
  } catch (err) {
    const userMsg = mapTimesheetOracleError(err);
    if (userMsg) throw new DatabaseError(userMsg, err, userMsg);
    if (err instanceof DatabaseError) throw err;
    throw new DatabaseError('Failed to list timesheets.', err);
  }
}

export const STATUS_CODES_LIST = STATUS_CODES;
export const DEFAULT_PAGE_SIZE = DEFAULT_LIMIT;
export const MAX_PAGE_SIZE = MAX_LIMIT;
