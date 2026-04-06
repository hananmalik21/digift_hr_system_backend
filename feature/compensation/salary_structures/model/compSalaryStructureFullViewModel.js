/**
 * Read-only list from COMP.COMP_SALARY_STRUCTURE_FULL_V (pagination, search, status, sort).
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { escapeLikePattern } from '../../components/model/compComponentsViewModel.js';
import { rowKeysUpper } from '../utils/rowKeysUpper.js';
import {
  enterpriseFilterColumnFromEnv,
  readScalarCount,
  wrapSalaryStructureViewDbError
} from '../utils/oracleListHelpers.js';

const VIEW_ALIAS = 'v';
const LOG_TAG = 'compSalaryStructureFullViewModel';

const VIEW_SELECT_SQL = `SELECT ${VIEW_ALIAS}.* FROM COMP.COMP_SALARY_STRUCTURE_FULL_V ${VIEW_ALIAS}`;

/** API sort_by → SQL ORDER BY expression (whitelist). Audit columns are not exposed on the list response. */
export const SALARY_STRUCTURE_FULL_V_SORT_COLUMNS = {
  structure_id: `${VIEW_ALIAS}.STRUCTURE_ID`,
  enterprise_id: `${VIEW_ALIAS}.ENTERPRISE_ID`,
  structure_code: `${VIEW_ALIAS}.STRUCTURE_CODE`,
  structure_name: `${VIEW_ALIAS}.STRUCTURE_NAME`,
  structure_active_flag: `${VIEW_ALIAS}.STRUCTURE_ACTIVE_FLAG`
};

/**
 * Map view row to API list item (snake_case). Omits audit/who columns.
 */
export function mapSalaryStructureFullViewRow(row) {
  if (!row) return null;
  const r = rowKeysUpper(row);
  const g = (k) => r[k];

  return {
    structure_id: g('STRUCTURE_ID') != null ? Number(g('STRUCTURE_ID')) : null,
    enterprise_id:
      g('ENTERPRISE_ID') != null
        ? Number(g('ENTERPRISE_ID'))
        : g('TENANT_ID') != null
          ? Number(g('TENANT_ID'))
          : null,
    structure_code: g('STRUCTURE_CODE') != null ? String(g('STRUCTURE_CODE')) : null,
    structure_name: g('STRUCTURE_NAME') != null ? String(g('STRUCTURE_NAME')) : null,
    structure_active_flag:
      g('STRUCTURE_ACTIVE_FLAG') != null ? String(g('STRUCTURE_ACTIVE_FLAG')) : null
  };
}

/**
 * @param {object} filters - { enterprise_id, search?, statusActiveFlag? } — statusActiveFlag 'Y'|'N'|undefined
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listSalaryStructuresFromFullView(filters, pagination, sort) {
  const conditions = [];
  const binds = {};
  let bi = 0;
  const bind = (val) => {
    const name = `b${bi++}`;
    binds[name] = val;
    return `:${name}`;
  };

  conditions.push(`${VIEW_ALIAS}.${enterpriseFilterColumnFromEnv()} = ${bind(filters.enterprise_id)}`);

  if (filters.statusActiveFlag === 'Y' || filters.statusActiveFlag === 'N') {
    conditions.push(`${VIEW_ALIAS}.STRUCTURE_ACTIVE_FLAG = ${bind(filters.statusActiveFlag)}`);
  }

  if (filters.search != null && String(filters.search).trim() !== '') {
    const esc = escapeLikePattern(filters.search.trim());
    const pat = bind(`%${esc}%`);
    conditions.push(`(
      UPPER(${VIEW_ALIAS}.STRUCTURE_CODE) LIKE UPPER(${pat}) ESCAPE '\\'
      OR UPPER(${VIEW_ALIAS}.STRUCTURE_NAME) LIKE UPPER(${pat}) ESCAPE '\\'
    )`);
  }

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderCol =
    SALARY_STRUCTURE_FULL_V_SORT_COLUMNS[sort.sortBy] || `${VIEW_ALIAS}.STRUCTURE_ID`;
  const orderDir = sort.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const offset = (pagination.page - 1) * pagination.pageSize;

  const countSql = `SELECT COUNT(*) AS CNT FROM COMP.COMP_SALARY_STRUCTURE_FULL_V ${VIEW_ALIAS} ${whereSql}`;
  const dataSql = `${VIEW_SELECT_SQL} ${whereSql} ORDER BY ${orderCol} ${orderDir} NULLS LAST OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`;

  const dataBinds = { ...binds, off: offset, lim: pagination.pageSize };

  try {
    return await withCompSchemaConnection(async (connection) => {
      const countResult = await connection.execute(countSql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const total = readScalarCount(countResult);

      const dataResult = await connection.execute(dataSql, dataBinds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: Math.min(100, Math.max(10, pagination.pageSize))
      });
      const rows = (dataResult.rows || []).map(mapSalaryStructureFullViewRow);
      return { rows, total };
    });
  } catch (err) {
    throw wrapSalaryStructureViewDbError(err, 'listSalaryStructuresFromFullView', LOG_TAG);
  }
}
