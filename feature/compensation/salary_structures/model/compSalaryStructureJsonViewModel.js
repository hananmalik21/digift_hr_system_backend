/**
 * COMP.COMP_SALARY_STRUCTURE_JSON_V — list (header columns) and detail (full JSON row).
 * Dynamic WHERE + typed binds only (no optional NULL bind OR-patterns).
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { escapeLikePattern } from '../../components/model/compComponentsViewModel.js';
import {
  enterpriseFilterColumnFromEnv,
  readScalarCount,
  wrapSalaryStructureViewDbError
} from '../utils/oracleListHelpers.js';

const VIEW_NAME = 'COMP.COMP_SALARY_STRUCTURE_JSON_V';
const LOG_TAG = 'compSalaryStructureJsonViewModel';

/** Tuned for wide JSON rows (STRUCTURE_OBJ + list); thin default in listSalaryStructuresFromJsonViewPaged. */
const FETCH_ARRAY_LIST_WITH_STRUCTURE_OBJ_CAP = 25;
const FETCH_ARRAY_DETAIL_CAP = 25;

function envRaw(name) {
  return String(process.env[name] ?? '')
    .trim()
    .toLowerCase();
}

function envIsAffirmative(name) {
  const v = envRaw(name);
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envIsNegative(name) {
  const v = envRaw(name);
  return v === '0' || v === 'false' || v === 'no' || v === 'off';
}

/**
 * When COMP.COMP_SALARY_STRUCTURE_JSON_V includes STRUCTURE_TYPE_CODE and LOCATION_OBJ, set
 * COMP_SALARY_STRUCTURE_JSON_V_TYPE_LOCATION_COLS=1 (otherwise list/detail SELECT hits ORA-00904).
 */
function jsonViewTypeLocationColsEnabled() {
  return envIsAffirmative('COMP_SALARY_STRUCTURE_JSON_V_TYPE_LOCATION_COLS');
}

function typeAndLocationSelectLines() {
  return jsonViewTypeLocationColsEnabled()
    ? `STRUCTURE_TYPE_CODE,
  LOCATION_OBJ,
  `
    : '';
}

/**
 * Append STRUCTURE_OBJ on list SELECT so Node can fill structure_type_code / location_obj from STRUCTURE_OBJ
 * when view columns are absent or null. Default: include when TYPE_LOCATION_COLS is off; override with
 * COMP_SALARY_STRUCTURE_JSON_V_LIST_INCLUDE_STRUCTURE_OBJ=1|0.
 */
export function jsonViewListSelectIncludesStructureObj() {
  const name = 'COMP_SALARY_STRUCTURE_JSON_V_LIST_INCLUDE_STRUCTURE_OBJ';
  if (envIsAffirmative(name)) return true;
  if (envIsNegative(name)) return false;
  return !jsonViewTypeLocationColsEnabled();
}

function listStructureObjSelectSuffix() {
  return jsonViewListSelectIncludesStructureObj() ? ', STRUCTURE_OBJ' : '';
}

/** sort_by (API snake_case) → ORDER BY column on the view. */
export const SALARY_STRUCTURE_JSON_V_LIST_SORT_COLUMNS = {
  structure_id: 'STRUCTURE_ID',
  structure_guid: 'STRUCTURE_GUID',
  structure_code: 'STRUCTURE_CODE',
  structure_name: 'STRUCTURE_NAME',
  ...(jsonViewTypeLocationColsEnabled()
    ? { structure_type_code: 'STRUCTURE_TYPE_CODE' }
    : {}),
  creation_date: 'CREATION_DATE',
  last_update_date: 'LAST_UPDATE_DATE'
};

function activeFlagPhysicalColumn() {
  const c = (process.env.COMP_SALARY_STRUCTURE_JSON_V_ACTIVE_COL || 'ACTIVE_FLAG').trim().toUpperCase();
  if (c === 'STRUCTURE_ACTIVE_FLAG') return 'STRUCTURE_ACTIVE_FLAG';
  return 'ACTIVE_FLAG';
}

/** STRUCTURE_GUID stored as RAW(16) default; set COMP_SALARY_STRUCTURE_JSON_V_GUID_FORMAT=VARCHAR if the view exposes a string GUID. */
function structureGuidMatchSql() {
  const fmt = (process.env.COMP_SALARY_STRUCTURE_JSON_V_GUID_FORMAT || 'RAW').trim().toUpperCase();
  if (fmt === 'VARCHAR' || fmt === 'STRING') {
    return 'UPPER(TRIM(STRUCTURE_GUID)) = :structure_guid_hex';
  }
  return 'UPPER(RAWTOHEX(STRUCTURE_GUID)) = :structure_guid_hex';
}

/** Header-only SELECT for grid/list (no JSON blob columns). */
export function buildJsonViewListSelectSql() {
  const af = activeFlagPhysicalColumn();
  return `
  STRUCTURE_ID,
  STRUCTURE_GUID,
  ENTERPRISE_ID,
  STRUCTURE_CODE,
  STRUCTURE_NAME,
  ${typeAndLocationSelectLines()}${af} AS ACTIVE_FLAG,
  CREATED_BY,
  CREATION_DATE,
  LAST_UPDATED_BY,
  LAST_UPDATE_DATE${listStructureObjSelectSuffix()}
`
    .replace(/\s+/g, ' ')
    .trim();
}

/** Full row for detail endpoint (includes JSON/CLOB columns). */
export function buildJsonViewDetailSelectSql() {
  const af = activeFlagPhysicalColumn();
  return `
  STRUCTURE_ID,
  STRUCTURE_GUID,
  ENTERPRISE_ID,
  STRUCTURE_CODE,
  STRUCTURE_NAME,
  ${typeAndLocationSelectLines()}${af} AS ACTIVE_FLAG,
  CREATED_BY,
  CREATION_DATE,
  LAST_UPDATED_BY,
  LAST_UPDATE_DATE,
  STRUCTURE_OBJ,
  ADVANCED_SETTINGS_OBJ,
  ORG_SCOPES_JSON,
  FINANCIAL_DETAILS_JSON,
  GRADE_RANGES_JSON,
  JOB_FAMILIES_JSON,
  POSITIONS_JSON,
  COMPONENTS_JSON
`
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {{
 *   enterprise_id: number,
 *   structure_id: number|null,
 *   structure_guid_hex: string|null,
 *   search_pattern: string|null,
 *   p_status: 'ACTIVE'|'INACTIVE'|'ALL'|null
 * }} filters
 */
function buildJsonViewWhereAndBinds(filters) {
  const entCol = enterpriseFilterColumnFromEnv();
  const af = activeFlagPhysicalColumn();
  const parts = [`${entCol} = :enterprise_id`];
  const binds = {
    enterprise_id: { val: filters.enterprise_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  if (filters.structure_id != null) {
    parts.push('STRUCTURE_ID = :structure_id');
    binds.structure_id = { val: filters.structure_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
  }

  if (filters.structure_guid_hex != null) {
    parts.push(structureGuidMatchSql());
    binds.structure_guid_hex = {
      val: filters.structure_guid_hex,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 40
    };
  }

  if (filters.search_pattern != null) {
    const searchMax = Math.min(
      32767,
      Math.max(4000, String(filters.search_pattern).length + 64)
    );
    parts.push(`(
      UPPER(STRUCTURE_CODE) LIKE UPPER(:search_pattern) ESCAPE '\\'
      OR UPPER(STRUCTURE_NAME) LIKE UPPER(:search_pattern) ESCAPE '\\'
    )`);
    binds.search_pattern = {
      val: filters.search_pattern,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: searchMax
    };
  }

  if (filters.p_status === 'ACTIVE') {
    parts.push(`${af} = 'Y'`);
  } else if (filters.p_status === 'INACTIVE') {
    parts.push(`${af} = 'N'`);
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds };
}

function orderColumnForList(sort) {
  const col =
    SALARY_STRUCTURE_JSON_V_LIST_SORT_COLUMNS[sort.sortBy] || 'STRUCTURE_ID';
  return col;
}

/**
 * @param {{
 *   enterprise_id: number,
 *   structure_id?: number|null,
 *   structure_guid?: string|null,
 *   search?: string|null,
 *   status?: string|null
 * }} input
 */
export function buildJsonViewListFilterValues(input) {
  const enterprise_id = input.enterprise_id;
  let structure_id = null;
  if (input.structure_id != null && input.structure_id !== '') {
    const n = Number(input.structure_id);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('structure_id must be a valid positive integer');
    }
    structure_id = n;
  }

  let structure_guid_hex = null;
  if (input.structure_guid != null && String(input.structure_guid).trim() !== '') {
    const g = String(input.structure_guid).trim().toUpperCase();
    if (!/^[0-9A-F]{32}$/.test(g)) {
      throw new Error('structure_guid must be a 32-character hexadecimal string');
    }
    structure_guid_hex = g;
  }

  let search_pattern = null;
  if (input.search != null && String(input.search).trim() !== '') {
    const esc = escapeLikePattern(String(input.search).trim());
    search_pattern = `%${esc}%`;
  }

  let p_status = null;
  if (input.status != null && String(input.status).trim() !== '') {
    const u = String(input.status).trim().toUpperCase();
    if (u !== 'ACTIVE' && u !== 'INACTIVE' && u !== 'ALL') {
      throw new Error('status must be ACTIVE, INACTIVE, or ALL');
    }
    p_status = u;
  }

  return {
    enterprise_id,
    structure_id,
    structure_guid_hex,
    search_pattern,
    p_status
  };
}

/**
 * @param {ReturnType<typeof buildJsonViewListFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 * @param {{ selectSql: string, logLabel: string, fetchArraySize?: number }} opts
 */
async function listSalaryStructuresFromJsonViewPaged(filters, pagination, sort, opts) {
  const { whereSql, binds: whereBinds } = buildJsonViewWhereAndBinds(filters);
  const { selectSql, logLabel, fetchArraySize } = opts;
  const rowOffset = (pagination.page - 1) * pagination.pageSize;
  const fetchSize = pagination.pageSize;
  const orderCol = orderColumnForList(sort);
  const orderDir = sort.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW_NAME} ${whereSql}`;
  const dataSql = `
SELECT ${selectSql}
FROM ${VIEW_NAME}
${whereSql}
ORDER BY ${orderCol} ${orderDir} NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY
`.trim();

  const dataBinds = {
    ...whereBinds,
    row_offset: { val: rowOffset, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
    fetch_size: { val: fetchSize, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  const arraySize =
    fetchArraySize ?? Math.min(100, Math.max(10, fetchSize));

  try {
    return await withCompSchemaConnection(async (connection) => {
      const countResult = await connection.execute(countSql, whereBinds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      const total = readScalarCount(countResult);

      const dataResult = await connection.execute(dataSql, dataBinds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        fetchArraySize: arraySize
      });
      return { rows: dataResult.rows || [], total };
    });
  } catch (err) {
    throw wrapSalaryStructureViewDbError(err, logLabel, LOG_TAG);
  }
}

/**
 * @param {ReturnType<typeof buildJsonViewListFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listSalaryStructureHeadersFromJsonView(filters, pagination, sort) {
  const fetchSize = pagination.pageSize;
  const heavyList = jsonViewListSelectIncludesStructureObj();
  return listSalaryStructuresFromJsonViewPaged(filters, pagination, sort, {
    selectSql: buildJsonViewListSelectSql(),
    logLabel: 'listSalaryStructureHeadersFromJsonView',
    fetchArraySize: heavyList
      ? Math.min(FETCH_ARRAY_LIST_WITH_STRUCTURE_OBJ_CAP, Math.max(1, fetchSize))
      : undefined
  });
}

/**
 * Same filters/pagination as list, but SELECT includes all JSON/CLOB columns on the view.
 * @param {ReturnType<typeof buildJsonViewListFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listSalaryStructureFullRowsFromJsonView(filters, pagination, sort) {
  const fetchSize = pagination.pageSize;
  return listSalaryStructuresFromJsonViewPaged(filters, pagination, sort, {
    selectSql: buildJsonViewDetailSelectSql(),
    logLabel: 'listSalaryStructureFullRowsFromJsonView',
    fetchArraySize: Math.min(FETCH_ARRAY_DETAIL_CAP, Math.max(1, fetchSize))
  });
}

/**
 * Single detail row by enterprise + optional structure_id and/or structure_guid_hex (AND when both).
 * @param {{ enterprise_id: number, structure_id: number|null, structure_guid_hex: string|null }} key
 */
export async function getSalaryStructureDetailRowFromJsonView(key) {
  if (key.structure_id == null && key.structure_guid_hex == null) {
    throw new Error('structure_id or structure_guid is required');
  }

  const { whereSql, binds } = buildJsonViewWhereAndBinds({
    enterprise_id: key.enterprise_id,
    structure_id: key.structure_id,
    structure_guid_hex: key.structure_guid_hex,
    search_pattern: null,
    p_status: null
  });
  const sql = `SELECT ${buildJsonViewDetailSelectSql()} FROM ${VIEW_NAME} ${whereSql}`;

  try {
    return await withCompSchemaConnection(async (connection) => {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return result.rows?.[0] ?? null;
    });
  } catch (err) {
    throw wrapSalaryStructureViewDbError(err, 'getSalaryStructureDetailRowFromJsonView', LOG_TAG);
  }
}
