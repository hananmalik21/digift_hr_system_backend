import oracledb from 'oracledb';
import db from '../../../config/db.js';
import { parseJsonClobOut, textClobBind } from '../../../utils/oracleClobBinds.js';
import { oraclePlsqlErrorMessage } from '../../../utils/oraclePackageUtils.js';

/** Logical module name → Oracle package (domain-specific, not monolithic ENT_API_PKG body). */
export const ENT_MODULE_PACKAGES = Object.freeze({
  STATS: 'ENT_STATS_PKG',
  ENTERPRISES: 'ENT_ENTERPRISES_PKG',
  STRUCTURE_LEVELS: 'ENT_STRUCTURE_LEVELS_PKG',
  ORG_UNITS: 'ORG_UNITS_PKG',
  JOB_FAMILIES: 'ENT_JOB_FAMILIES_PKG',
  GRADES: 'ENT_GRADES_PKG',
  JOB_LEVELS: 'ENT_JOB_LEVELS_PKG',
  POSITIONS: 'ENT_POSITIONS_PKG',
  HR_ORG_STRUCTURES: 'ENT_HR_ORG_STRUCTURES_PKG',
  HR_ORG_HIERARCHY_LEVELS: 'ENT_HR_ORG_HIERARCHY_LEVELS_PKG'
});

function invokePlsql(packageName) {
  return `
BEGIN
  ENT.${packageName}.INVOKE(
    p_action       => :p_action,
    p_payload_json => :p_payload_json,
    p_result_json  => :p_result_json,
    p_status       => :p_status,
    p_message      => :p_message
  );
END;`;
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {string} module
 * @param {string} action
 * @param {Record<string, unknown>} [payload]
 */
export async function entInvoke(connection, module, action, payload = {}) {
  const moduleKey = String(module ?? '').trim().toUpperCase();
  const packageName = ENT_MODULE_PACKAGES[moduleKey];
  if (!packageName) {
    const err = new Error(`Unknown ENT module: ${module}`);
    err.code = 'ENT_API_ERROR';
    throw err;
  }

  const binds = {
    p_action: { val: action, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 64 },
    p_payload_json: textClobBind(JSON.stringify(payload ?? {})),
    p_result_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  const result = await connection.execute(invokePlsql(packageName), binds, { autoCommit: false });
  const out = result.outBinds ?? {};
  const status = String(out.p_status ?? '').trim().toUpperCase();
  const message = out.p_message != null ? String(out.p_message).trim() : '';
  const data = await parseJsonClobOut(out.p_result_json);

  if (status !== 'S') {
    const err = new Error(message || `${module}.${action} failed`);
    err.code = 'ENT_API_ERROR';
    throw err;
  }

  return { data, message };
}

/**
 * @param {string} module
 * @param {string} action
 * @param {Record<string, unknown>} [payload]
 * @param {{ connection?: import('oracledb').Connection, autoCommit?: boolean }} [options]
 */
export async function entInvokeWithConnection(module, action, payload = {}, options = {}) {
  if (options.connection) {
    return entInvoke(options.connection, module, action, payload);
  }

  let connection;
  try {
    connection = await db.getConnection();
    const result = await entInvoke(connection, module, action, payload);
    if (options.autoCommit !== false) {
      await connection.commit();
    }
    return result;
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch (_) {}
    }
    if (error?.errorNum != null) {
      const msg = oraclePlsqlErrorMessage(error, error.message);
      const mapped = new Error(
        /package body.*has errors|ORA-04063|ORA-06545/i.test(msg)
          ? `${msg} — Recompile invalid ENT domain packages in SQL Developer Web`
          : msg
      );
      mapped.errorNum = error.errorNum;
      throw mapped;
    }
    throw error;
  } finally {
    if (connection?.close) {
      try { await connection.close(); } catch (_) {}
    }
  }
}

/** @param {unknown} data */
function parseListDataField(data) {
  if (data == null) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'string') {
    const trimmed = data.trim();
    if (!trimmed || trimmed === 'null') return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** @param {unknown} row */
export function rowsFromListEnvelope(row) {
  if (!row || typeof row !== 'object') return [];
  if (Array.isArray(row)) return row;
  if ('data' in row) return parseListDataField(row.data);
  return [];
}

/** @param {unknown} row */
export function totalFromListEnvelope(row, fallback = 0) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return fallback;
  const total = Number(row.total);
  return Number.isFinite(total) ? total : rowsFromListEnvelope(row).length;
}

/**
 * Convert API JSON keys to lowercase snake_case (match model layer).
 * @param {unknown} value
 */
export function toSnakeCaseDeep(value) {
  if (value == null || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map(toSnakeCaseDeep);
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key.toLowerCase()] = toSnakeCaseDeep(val);
  }
  return out;
}
