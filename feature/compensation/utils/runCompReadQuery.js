/**
 * Reusable read-only Oracle query runner for COMP schema views (bind variables only).
 */

import oracledb from 'oracledb';
import { executeQuery } from '../../../config/db.js';
import { withCompSchemaConnection } from '../db/withCompSchemaConnection.js';
import { DatabaseError } from '../../../utils/errors/index.js';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/**
 * @param {Error} err
 * @param {string} context
 * @param {string} logTag
 */
export function wrapCompReadDbError(err, context, logTag) {
  console.error(
    `[${logTag}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  return new DatabaseError(err?.message || 'Database error', err, null);
}

/**
 * Execute a read query against COMP with optional typed binds.
 *
 * @param {string} sql
 * @param {Record<string, unknown>|unknown[]} binds
 * @param {{ context?: string, logTag?: string, fetchArraySize?: number }} [options]
 */
export async function runCompReadQuery(sql, binds = {}, options = {}) {
  const { context = 'runCompReadQuery', logTag = 'runCompReadQuery', fetchArraySize } = options;

  return withCompSchemaConnection(async (connection) => {
    try {
      const executeOptions = { connection, ...ROW_OBJECT };
      if (fetchArraySize != null) {
        executeOptions.fetchArraySize = fetchArraySize;
      }
      return await executeQuery(sql, binds, executeOptions);
    } catch (err) {
      throw wrapCompReadDbError(err, context, logTag);
    }
  });
}

/**
 * @param {import('oracledb').Result<unknown>} result
 * @returns {number}
 */
export function readCountFromResult(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object' || Array.isArray(row)) return 0;
  const v =
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((x) => x != null && (typeof x === 'number' || typeof x === 'string'));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
