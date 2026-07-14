import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { resolvePayElementRelRulesUserMessage } from './payElementRelRulesOracleErrors.js';

export const VIEW_ROW_FORMAT = {
  outFormat: oracledb.OUT_FORMAT_OBJECT,
  fetchAsString: [oracledb.CLOB]
};
export const VIEW_GENERIC_ERROR = 'Unable to fetch element relationship rules. Please try again.';
export const VIEW_LOG_TAG = 'payElementRelRulesViewModel';

export function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

export function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

export function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const s = String(value).trim();
  return s || null;
}

export function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  return s || null;
}

export function normalizeRuleGuidHex(ruleGuidHex) {
  return String(ruleGuidHex).trim().toUpperCase();
}

export function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ?? row.total_records ?? row.CNT ?? row.count ?? Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function logViewOracleError(context, err) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${VIEW_LOG_TAG}] ${context} ${code}`, err?.message || err);
}

/**
 * Run work with a live Oracle connection. CLOB Lobs must be read before close.
 * @template T
 * @param {(connection: import('oracledb').Connection) => Promise<T>} work
 * @param {string} context
 * @returns {Promise<T>}
 */
export async function withViewConnection(work, context) {
  let connection;
  try {
    connection = await db.getConnection();
    return await work(connection);
  } catch (err) {
    logViewOracleError(context, err);
    throw new DatabaseError(VIEW_GENERIC_ERROR, err, resolvePayElementRelRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} sql
 * @param {Record<string, unknown>} binds
 * @param {string} context
 */
export async function executeViewQuery(sql, binds, context) {
  return withViewConnection(
    (connection) => connection.execute(sql, binds, VIEW_ROW_FORMAT),
    context
  );
}

/**
 * Normalize Oracle GUID / hex for API responses (lowercase).
 * @param {unknown} value
 * @returns {string|null}
 */
export function mapGuidField(value) {
  const hex = normalizeOutGuidHex(value);
  return hex == null ? null : String(hex).toLowerCase();
}

/** @param {import('oracledb').Connection} connection */
export function executeView(connection, sql, binds) {
  return connection.execute(sql, binds, VIEW_ROW_FORMAT);
}
