import oracledb from 'oracledb';
import db from '../../../config/db.js';
import { bufferToHex, hexToRawBuffer } from '../../../utils/guidUtils.js';

export async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Trimmed VARCHAR2 bind for profile / link fields (default max 1000). */
export function strLinkInBind(v, maxSize = 1000) {
  return {
    val: strOrNull(v),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize
  };
}

/**
 * Y/N bind for Oracle CHAR(1). When value is omitted, uses defaultVal (often 'N' on create, null on update).
 * @param {unknown} v
 * @param {string|null} [defaultVal]
 */
export function ynInBind(v, defaultVal = null) {
  if (v === undefined || v === null || String(v).trim() === '') {
    return {
      val: defaultVal,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1
    };
  }
  return {
    val: String(v).trim().toUpperCase(),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 1
  };
}

export function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

export function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function normalizeOutGuidHex(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutGuidHex(v[0]);
  return bufferToHex(v);
}

export function guidInBind(hex) {
  return {
    val: hexToRawBuffer(hex),
    dir: oracledb.BIND_IN,
    type: oracledb.BUFFER,
    maxSize: 16
  };
}

/** CLOB bind for long text (notes, rejection comments). */
export function clobInBind(v) {
  return {
    val: strOrNull(v),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

/**
 * Uppercase code VARCHAR2 bind.
 * @param {unknown} v
 * @param {number} [maxSize]
 */
export function codeInBind(v, maxSize = 50) {
  const s = strOrNull(v);
  return {
    val: s ? s.toUpperCase() : null,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize
  };
}

/**
 * @param {string} plsql
 * @param {Record<string, unknown>} binds
 * @param {(outBinds: Record<string, unknown>|undefined) => Record<string, unknown>} parseOut
 * @param {string} logLabel
 * @param {Record<string, unknown>} errorResult
 */
export async function executePackagePlsql(plsql, binds, parseOut, logLabel, errorResult) {
  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return parseOut(result?.outBinds);
  } catch (err) {
    console.error(`[recApplicationsModel] ${logLabel} failed:`, err?.errorNum ?? '', '[redacted]');
    return errorResult;
  }
}

export function packageStatusIsSuccess(status) {
  return String(status ?? '')
    .trim()
    .toUpperCase() === 'SUCCESS';
}

export function statusOutBinds() {
  return {
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
export function parseActionOut(outBinds) {
  const ob = outBinds || {};
  return {
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 * @param {{ idKey: string, guidKey: string, idField: string, guidField: string }} keys
 */
export function parseCreateOut(outBinds, keys) {
  const ob = outBinds || {};
  return {
    [keys.idField]: normalizeOutNumber(ob[keys.idKey]),
    [keys.guidField]: normalizeOutGuidHex(ob[keys.guidKey]),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

/** @param {unknown} raw PASSWORD_HASH column value (VARCHAR2 or CLOB). */
export async function readDbPasswordHashValue(raw) {
  if (raw == null) return null;
  if (typeof raw?.getData === 'function') {
    const p = raw.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => raw.getData((err, d) => (err ? rej(err) : res(d))));
    const s = data != null ? String(data).trim() : '';
    return s.length ? s : null;
  }
  const s = String(raw).trim();
  return s.length ? s : null;
}

/** @param {unknown} hash */
export function passwordHashInBind(hash) {
  return {
    val: strOrNull(hash),
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 500
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
export function parseCandidateRegistrationOut(outBinds) {
  const ob = outBinds || {};
  return {
    candidate_id: normalizeOutNumber(ob.p_candidate_id),
    candidate_guid: normalizeOutGuidHex(ob.p_candidate_guid),
    candidate_user_id: normalizeOutNumber(ob.p_candidate_user_id),
    candidate_user_guid: normalizeOutGuidHex(ob.p_candidate_user_guid),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

/**
 * Accepts a JSON array from the request body; stringifies for Oracle CLOB bind.
 * @param {unknown} value
 * @param {{ allowEmptyArray?: boolean }} [options]
 * @returns {string|null}
 */
export function jsonArrayToClobString(value, options = {}) {
  const { allowEmptyArray = false } = options;
  if (value == null || value === '') return null;
  if (Array.isArray(value)) {
    if (value.length === 0) return allowEmptyArray ? '[]' : null;
    return JSON.stringify(value);
  }
  if (typeof value === 'object') {
    if (Object.keys(value).length === 0) return null;
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return JSON.stringify(parsed);
    } catch (_) {}
    return null;
  }
  return null;
}
