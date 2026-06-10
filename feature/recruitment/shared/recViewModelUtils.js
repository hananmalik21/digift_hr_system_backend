import oracledb from 'oracledb';
import { DatabaseError, ValidationError } from '../../../utils/errors/index.js';
import { withConnection } from './oraclePackageUtils.js';
import { pruneBindsForSql } from './recViewListSql.js';

export { withConnection };

export const ROW_OPTS = { outFormat: oracledb.OUT_FORMAT_OBJECT };

export function isNonEmptyTrimmed(raw) {
  return raw !== undefined && raw !== null && String(raw).trim() !== '';
}

/**
 * @param {unknown} err
 * @param {string} context
 * @param {string} userMessage
 */
export function rethrowUnlessOperational(err, context, userMessage) {
  if (err instanceof ValidationError) throw err;
  console.error(`[${context}]`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
  throw new DatabaseError(userMessage, err);
}

/**
 * @param {import('oracledb').Connection} connection
 * @param {{ view: string, selectSql: string, whereSql: string, binds: Record<string, unknown>, orderSql: string, page: number, limit: number, mapRow: (row: Record<string, unknown>) => unknown|Promise<unknown> }} opts
 */
export async function fetchPaginatedRows(connection, opts) {
  const { view, selectSql, whereSql, binds, orderSql, page, limit, mapRow } = opts;

  const countSql = `SELECT COUNT(*) AS TOTAL_COUNT FROM ${view} v ${whereSql}`;
  const countBinds = pruneBindsForSql(countSql, binds);
  const countResult = await connection.execute(countSql, countBinds, ROW_OPTS);
  const total =
    Number(countResult.rows?.[0]?.TOTAL_COUNT ?? countResult.rows?.[0]?.total_count ?? 0) || 0;

  const offset = (page - 1) * limit;
  const dataSql = `${selectSql} ${whereSql} ${orderSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
  const dataBinds = pruneBindsForSql(dataSql, {
    ...binds,
    offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  });
  const dataResult = await connection.execute(dataSql, dataBinds, ROW_OPTS);

  const rows = [];
  for (const row of dataResult.rows || []) {
    rows.push(await mapRow(row));
  }
  return { rows, total, page, limit };
}
