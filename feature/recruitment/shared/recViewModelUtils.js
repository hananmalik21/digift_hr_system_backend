import oracledb from 'oracledb';
import { DatabaseError, NotFoundError, ValidationError } from '../../../utils/errors/index.js';
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
  if (err instanceof NotFoundError) throw err;
  console.error(`[${context}]`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
  throw new DatabaseError(userMessage, err, userMessage);
}

/** @param {{ rows?: Array<Record<string, unknown>> }|null|undefined} countResult */
export function readTotalCount(countResult) {
  const row = countResult?.rows?.[0];
  return Number(row?.TOTAL_COUNT ?? row?.total_count ?? 0) || 0;
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @param {(row: Record<string, unknown>) => unknown|Promise<unknown>} mapRow
 */
export async function mapResultRows(rows, mapRow) {
  return Promise.all((rows || []).map((row) => mapRow(row)));
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
  const total = readTotalCount(countResult);

  const offset = (page - 1) * limit;
  const dataSql = `${selectSql} ${whereSql} ${orderSql} OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
  const dataBinds = pruneBindsForSql(dataSql, {
    ...binds,
    offset: { val: offset, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    limit: { val: limit, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  });
  const dataResult = await connection.execute(dataSql, dataBinds, ROW_OPTS);
  const rows = await mapResultRows(dataResult.rows, mapRow);
  return { rows, total, page, limit };
}
