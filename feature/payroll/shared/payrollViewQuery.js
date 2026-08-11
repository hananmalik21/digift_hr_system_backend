/**
 * Generic paginated view/table query helper for PAY schema reads.
 */

import oracledb from 'oracledb';
import { withPayViewConnection, logPayViewOracleError } from '../../pay/utils/payViewModelUtils.js';
import { mapPayRow } from './payrollRowMapper.js';

/**
 * @param {{
 *   fromSql: string,
 *   selectSql?: string,
 *   alias?: string,
 *   filters?: Array<{ sql: string, bind?: string, value?: unknown, skipIfEmpty?: boolean }>,
 *   search?: { columns: string[], value?: string },
 *   sortBy?: string,
 *   sortOrder?: string,
 *   allowedSort?: Record<string, string>,
 *   defaultSort?: string,
 *   page?: number,
 *   pageSize?: number,
 *   mapOptions?: object,
 *   mapRow?: (row: Record<string, unknown>) => Promise<object>|object,
 *   logTag?: string
 * }} options
 */
export async function queryPayList(options) {
  const page = Math.max(1, Number(options.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(options.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const alias = options.alias || 'v';
  const binds = {};
  const where = [];

  for (const f of options.filters || []) {
    if (f.skipIfEmpty !== false && (f.value == null || f.value === '')) continue;
    where.push(f.sql);
    if (f.bind) binds[f.bind] = f.value;
  }

  if (options.search?.value && options.search.columns?.length) {
    const term = `%${String(options.search.value).trim().toUpperCase()}%`;
    binds.search = term;
    where.push(
      `(${options.search.columns.map((c) => `UPPER(${c}) LIKE :search`).join(' OR ')})`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const allowedSort = options.allowedSort || {};
  const sortKey = String(options.sortBy || '').toLowerCase();
  const sortCol = allowedSort[sortKey] || options.defaultSort || `${alias}.CREATION_DATE DESC`;
  const sortOrder =
    String(options.sortOrder || '').toLowerCase() === 'asc' && !/ASC|DESC/i.test(sortCol)
      ? 'ASC'
      : String(options.sortOrder || '').toLowerCase() === 'desc' && !/ASC|DESC/i.test(sortCol)
        ? 'DESC'
        : '';
  const orderSql = /ASC|DESC/i.test(sortCol)
    ? `ORDER BY ${sortCol}`
    : `ORDER BY ${sortCol} ${sortOrder || 'DESC'}`;

  const selectSql = options.selectSql || `${alias}.*`;
  const sql = `
    SELECT ${selectSql}, COUNT(*) OVER() AS TOTAL_COUNT
    FROM ${options.fromSql}
    ${whereSql}
    ${orderSql}
    OFFSET :offset ROWS FETCH NEXT :page_size ROWS ONLY
  `;

  binds.offset = offset;
  binds.page_size = pageSize;

  return withPayViewConnection(async (connection) => {
    try {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const rows = result.rows || [];
      const total = rows.length ? Number(rows[0].TOTAL_COUNT || 0) : 0;
      const data = await Promise.all(
        rows.map((row) =>
          options.mapRow ? options.mapRow(row) : mapPayRow(row, options.mapOptions)
        )
      );
      return { data, total, page, pageSize };
    } catch (err) {
      logPayViewOracleError(options.logTag || 'payrollView', 'list', err);
      throw err;
    }
  });
}

/**
 * Fetch a single row.
 */
export async function queryPayOne({
  fromSql,
  selectSql,
  alias = 'v',
  filters = [],
  mapOptions,
  mapRow,
  logTag = 'payrollView'
}) {
  const binds = {};
  const where = [];
  for (const f of filters) {
    if (f.skipIfEmpty !== false && (f.value == null || f.value === '')) continue;
    where.push(f.sql);
    if (f.bind) binds[f.bind] = f.value;
  }
  if (!where.length) return null;

  const sql = `
    SELECT ${selectSql || `${alias}.*`}
    FROM ${fromSql}
    WHERE ${where.join(' AND ')}
    FETCH FIRST 1 ROW ONLY
  `;

  return withPayViewConnection(async (connection) => {
    try {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const row = result.rows?.[0];
      if (!row) return null;
      return mapRow ? await mapRow(row) : mapPayRow(row, mapOptions);
    } catch (err) {
      logPayViewOracleError(logTag, 'get', err);
      throw err;
    }
  });
}

/**
 * Fetch many rows without pagination (capped).
 */
export async function queryPayMany({
  fromSql,
  selectSql,
  alias = 'v',
  filters = [],
  orderBy,
  maxRows = 500,
  mapOptions,
  mapRow,
  logTag = 'payrollView'
}) {
  const binds = { max_rows: maxRows };
  const where = [];
  for (const f of filters) {
    if (f.skipIfEmpty !== false && (f.value == null || f.value === '')) continue;
    where.push(f.sql);
    if (f.bind) binds[f.bind] = f.value;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT ${selectSql || `${alias}.*`}
    FROM ${fromSql}
    ${whereSql}
    ${orderBy ? `ORDER BY ${orderBy}` : ''}
    FETCH FIRST :max_rows ROWS ONLY
  `;

  return withPayViewConnection(async (connection) => {
    try {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return Promise.all(
        (result.rows || []).map((row) =>
          mapRow ? mapRow(row) : mapPayRow(row, mapOptions)
        )
      );
    } catch (err) {
      logPayViewOracleError(logTag, 'many', err);
      throw err;
    }
  });
}
