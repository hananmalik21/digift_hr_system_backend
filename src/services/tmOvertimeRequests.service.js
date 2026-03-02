import db from '../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError, NotFoundError } from '../../utils/errors/index.js';
import { guidToBuffer, bufferToGuidHex } from '../utils/oracleGuid.js';

const SCHEMA = 'TM';

/**
 * Run fn(connection) inside a transaction (commit on success, rollback on error).
 * Sets session schema to TM.
 */
async function runWithTransaction(fn, errorContext = 'operation') {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: false }
    );
    const result = await fn(connection);
    await connection.commit();
    return result;
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err instanceof DatabaseError || err instanceof NotFoundError) throw err;
    const msg = mapOracleError(err);
    throw new DatabaseError(msg || `Failed to ${errorContext}.`, err, msg);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function mapOracleError(err) {
  if (!err || typeof err.message !== 'string') return null;
  const msg = err.message.toUpperCase();
  if ((err.errorNum >= 20000 && err.errorNum <= 20999) || msg.includes('ORA-20')) {
    const firstLine = err.message.split(/\n/)[0].trim();
    return firstLine.replace(/\s*Help:\s*https?:\/\/[^\s]*/gi, '').trim() || null;
  }
  return null;
}

/** Run read-only query (no transaction, autoCommit). */
async function runReadOnly(fn) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: true }
    );
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function formatDate(val) {
  if (val == null) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 19).replace('T', ' ');
  return val;
}

/** Convert object keys to lowercase for API response. */
function keysToLower(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
  );
}

function mapRequestRow(row) {
  if (!row) return null;
  const out = { ...row };
  if (Buffer.isBuffer(out.OT_REQUEST_GUID)) out.OT_REQUEST_GUID = bufferToGuidHex(out.OT_REQUEST_GUID);
  if (Buffer.isBuffer(out.EMPLOYEE_GUID)) out.EMPLOYEE_GUID = bufferToGuidHex(out.EMPLOYEE_GUID);
  out.CREATION_DATE = formatDate(out.CREATION_DATE);
  out.LAST_UPDATE_DATE = formatDate(out.LAST_UPDATE_DATE);
  out.MANAGER_APPROVED_DATE = formatDate(out.MANAGER_APPROVED_DATE);
  out.HR_VALIDATED_DATE = formatDate(out.HR_VALIDATED_DATE);
  return keysToLower(out);
}

/**
 * Centralized PL/SQL procedure call helper.
 * @param {object} connection - Oracle connection
 * @param {string} plsql - Full block e.g. "BEGIN TM.TM_OT_REQUESTS_PKG.CREATE_REQUEST(...); END;"
 * @param {object} binds - Bind object (use oracledb.BIND_OUT for OUT params)
 * @param {object} [options] - { autoCommit }
 * @returns {Promise<{ result: object, outBinds: object }>}
 */
export async function callPlsql(connection, plsql, binds, options = {}) {
  const result = await connection.execute(plsql, binds, {
    autoCommit: false,
    ...options,
  });
  return { result, outBinds: result.outBinds || {} };
}

const REQUEST_COLUMNS = `
  OT_REQUEST_ID, TENANT_ID, OT_REQUEST_GUID, EMPLOYEE_GUID, ATTENDANCE_DAY_ID,
  REQUESTED_HOURS, REASON, OT_CONFIG_ID, OT_RATE_TYPE_ID, STATUS,
  MANAGER_APPROVED_BY, MANAGER_APPROVED_DATE, HR_VALIDATED_BY, HR_VALIDATED_DATE,
  CREATED_BY, CREATION_DATE, LAST_UPDATED_BY, LAST_UPDATE_DATE
`;

/**
 * Fetch single overtime request by tenant_id and ot_request_guid.
 * Returns row with STATUS and other columns; GUIDs as hex, dates formatted.
 */
export async function getRequestByGuid(connection, tenantId, guidBuffer) {
  const sql = `
    SELECT ${REQUEST_COLUMNS}
    FROM TM.TM_OVERTIME_REQUESTS
    WHERE TENANT_ID = :tenant_id AND OT_REQUEST_GUID = :guid
  `;
  const result = await connection.execute(
    sql,
    { tenant_id: tenantId, guid: guidBuffer },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const row = result.rows?.[0];
  return row ? mapRequestRow(row) : null;
}

/**
 * Get one overtime request by tenant_id and ot_request_guid (for GET API).
 * Throws NotFoundError if not found.
 */
export async function getOneRequest(tenantId, otRequestGuidStr) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');
  const row = await runReadOnly(async (conn) => getRequestByGuid(conn, tenantId, guidBuf));
  if (!row) throw new NotFoundError('Overtime request not found.');
  return row;
}

/**
 * List overtime requests by tenant_id with optional filters.
 * @param {number} tenantId - Required tenant id
 * @param {object} filters - { status, employee_guid, limit, offset }
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listRequests(tenantId, filters = {}) {
  const limit = Math.min(Math.max(Number(filters.limit) || 20, 1), 100);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const status = filters.status ? String(filters.status).trim().toUpperCase() : null;
  const employeeGuidBuf = filters.employee_guid ? guidToBuffer(filters.employee_guid) : null;

  return runReadOnly(async (connection) => {
    let whereClause = ' WHERE TENANT_ID = :tenant_id';
    const binds = { tenant_id: tenantId };
    if (status) {
      whereClause += ' AND STATUS = :status';
      binds.status = status;
    }
    if (employeeGuidBuf) {
      whereClause += ' AND EMPLOYEE_GUID = :employee_guid';
      binds.employee_guid = employeeGuidBuf;
    }

    const countSql = `SELECT COUNT(*) AS CNT FROM TM.TM_OVERTIME_REQUESTS ${whereClause}`;
    const countResult = await connection.execute(countSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const total = countResult.rows?.[0]?.CNT ?? 0;

    const dataSql = `
      SELECT * FROM (
        SELECT ROWNUM rn, T.* FROM (
          SELECT ${REQUEST_COLUMNS}
          FROM TM.TM_OVERTIME_REQUESTS
          ${whereClause}
          ORDER BY CREATION_DATE DESC, OT_REQUEST_ID DESC
        ) T
      ) WHERE rn > :off AND rn <= :off + :lim
    `;
    binds.off = offset;
    binds.lim = limit;
    const result = await connection.execute(dataSql, binds, { outFormat: oracledb.OUT_FORMAT_OBJECT });
    const rows = (result.rows || []).map((r) => {
      const { RN, rn, ...rest } = r; // Oracle returns RN uppercase; strip pagination column
      return mapRequestRow(rest);
    });
    return { rows, total };
  });
}

/**
 * Create overtime request. Returns { ot_request_guid, status, message }.
 * Status from DB after create (query by out guid).
 */
export async function createRequest(payload) {
  const employeeGuidBuf = guidToBuffer(payload.employee_guid);
  if (!employeeGuidBuf) throw new NotFoundError('Invalid employee_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.CREATE_REQUEST(
        p_tenant_id         => :p_tenant_id,
        p_employee_guid     => :p_employee_guid,
        p_attendance_day_id => :p_attendance_day_id,
        p_requested_hours  => :p_requested_hours,
        p_reason            => :p_reason,
        p_ot_config_id      => :p_ot_config_id,
        p_ot_rate_type_id   => :p_ot_rate_type_id,
        p_status            => :p_status,
        p_actor             => :p_actor,
        p_ot_request_guid   => :p_ot_request_guid
      );
    END;
  `;

  const p_ot_request_guid = { type: oracledb.BUFFER, dir: oracledb.BIND_OUT, maxSize: 16 };
  const binds = {
    p_tenant_id: payload.tenant_id,
    p_employee_guid: employeeGuidBuf,
    p_attendance_day_id: payload.attendance_day_id,
    p_requested_hours: payload.requested_hours,
    p_reason: payload.reason ?? null,
    p_ot_config_id: payload.ot_config_id ?? null,
    p_ot_rate_type_id: payload.ot_rate_type_id ?? null,
    p_status: (payload.status || 'DRAFT').toUpperCase(),
    p_actor: payload.actor,
    p_ot_request_guid,
  };

  return runWithTransaction(async (connection) => {
    const { outBinds } = await callPlsql(connection, plsql, binds);
    const outGuid = outBinds.p_ot_request_guid;
    const guidHex = bufferToGuidHex(outGuid) || (Buffer.isBuffer(outGuid) ? outGuid.toString('hex') : null);
    if (!guidHex) throw new DatabaseError('Create succeeded but ot_request_guid was not returned.', null, 'Create succeeded but ot_request_guid was not returned.');

    const row = await getRequestByGuid(connection, payload.tenant_id, outBinds.p_ot_request_guid);
    if (!row) throw new DatabaseError('Create succeeded but request could not be read back.', null);
    return row;
  }, 'create overtime request');
}

/**
 * Update draft. Allowed only when status is DRAFT (enforced in procedure).
 */
export async function updateDraft(tenantId, otRequestGuidStr, payload) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.UPDATE_DRAFT(
        p_ot_request_guid => :p_ot_request_guid,
        p_tenant_id       => :p_tenant_id,
        p_requested_hours => :p_requested_hours,
        p_reason          => :p_reason,
        p_ot_config_id    => :p_ot_config_id,
        p_ot_rate_type_id => :p_ot_rate_type_id,
        p_actor           => :p_actor
      );
    END;
  `;

  const binds = {
    p_ot_request_guid: guidBuf,
    p_tenant_id: tenantId,
    p_requested_hours: payload.requested_hours ?? null,
    p_reason: payload.reason ?? null,
    p_ot_config_id: payload.ot_config_id ?? null,
    p_ot_rate_type_id: payload.ot_rate_type_id ?? null,
    p_actor: payload.actor,
  };

  return runWithTransaction(async (connection) => {
    await callPlsql(connection, plsql, binds);
    const row = await getRequestByGuid(connection, tenantId, guidBuf);
    if (!row) throw new NotFoundError('Overtime request not found.');
    return row;
  }, 'update draft');
}

/**
 * Submit: DRAFT -> SUBMITTED (enforced in procedure).
 */
export async function submitRequest(tenantId, otRequestGuidStr, payload) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.SUBMIT_REQUEST(
        p_ot_request_guid => :p_ot_request_guid,
        p_tenant_id       => :p_tenant_id,
        p_actor           => :p_actor
      );
    END;
  `;

  const binds = {
    p_ot_request_guid: guidBuf,
    p_tenant_id: tenantId,
    p_actor: payload.actor,
  };

  return runWithTransaction(async (connection) => {
    await callPlsql(connection, plsql, binds);
    const row = await getRequestByGuid(connection, tenantId, guidBuf);
    if (!row) throw new NotFoundError('Overtime request not found.');
    return row;
  }, 'submit request');
}

/**
 * Approve: SUBMITTED -> APPROVED (enforced in procedure).
 */
export async function approveRequest(tenantId, otRequestGuidStr, payload) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.APPROVE_REQUEST(
        p_ot_request_guid => :p_ot_request_guid,
        p_tenant_id       => :p_tenant_id,
        p_actor           => :p_actor
      );
    END;
  `;

  const binds = {
    p_ot_request_guid: guidBuf,
    p_tenant_id: tenantId,
    p_actor: payload.actor,
  };

  return runWithTransaction(async (connection) => {
    await callPlsql(connection, plsql, binds);
    const row = await getRequestByGuid(connection, tenantId, guidBuf);
    if (!row) throw new NotFoundError('Overtime request not found.');
    return row;
  }, 'approve request');
}

/**
 * Reject: SUBMITTED -> REJECTED (enforced in procedure).
 */
export async function rejectRequest(tenantId, otRequestGuidStr, payload) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.REJECT_REQUEST(
        p_ot_request_guid => :p_ot_request_guid,
        p_tenant_id       => :p_tenant_id,
        p_actor           => :p_actor
      );
    END;
  `;

  const binds = {
    p_ot_request_guid: guidBuf,
    p_tenant_id: tenantId,
    p_actor: payload.actor,
  };

  return runWithTransaction(async (connection) => {
    await callPlsql(connection, plsql, binds);
    const row = await getRequestByGuid(connection, tenantId, guidBuf);
    if (!row) throw new NotFoundError('Overtime request not found.');
    return row;
  }, 'reject request');
}

/**
 * Cancel: DRAFT => hard delete; SUBMITTED => WITHDRAWN; else error (enforced in procedure).
 * After delete we cannot query row; return ot_request_guid from input and status 'DELETED' or from row.
 */
export async function cancelRequest(tenantId, otRequestGuidStr, payload) {
  const guidBuf = guidToBuffer(otRequestGuidStr);
  if (!guidBuf) throw new NotFoundError('Invalid ot_request_guid');

  const plsql = `
    BEGIN
      TM.TM_OT_REQUESTS_PKG.CANCEL_REQUEST(
        p_ot_request_guid => :p_ot_request_guid,
        p_tenant_id       => :p_tenant_id,
        p_actor           => :p_actor
      );
    END;
  `;

  const binds = {
    p_ot_request_guid: guidBuf,
    p_tenant_id: tenantId,
    p_actor: payload.actor,
  };

  return runWithTransaction(async (connection) => {
    await callPlsql(connection, plsql, binds);
    const row = await getRequestByGuid(connection, tenantId, guidBuf);
    const guidHex = bufferToGuidHex(guidBuf) || guidBuf.toString('hex');
    if (row) return row;
    return {
      ot_request_id: null,
      tenant_id: tenantId,
      ot_request_guid: guidHex,
      employee_guid: null,
      attendance_day_id: null,
      requested_hours: null,
      reason: null,
      ot_config_id: null,
      ot_rate_type_id: null,
      status: 'DELETED',
      manager_approved_by: null,
      manager_approved_date: null,
      hr_validated_by: null,
      hr_validated_date: null,
      created_by: null,
      creation_date: null,
      last_updated_by: null,
      last_update_date: null,
    };
  }, 'cancel request');
}
