/**
 * COMP.COMP_PLANS_FULL_V — paginated list (header or full row) and single row by plan_id.
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { escapeLikePattern } from '../../components/model/compComponentsViewModel.js';
import { readScalarCount } from '../../salary_structures/utils/oracleListHelpers.js';
import { DatabaseError } from '../../../../utils/errors/index.js';

const VIEW_NAME = 'COMP.COMP_PLANS_FULL_V';
const LOG_TAG = 'compPlansFullViewModel';

export const PLANS_FULL_V_SORT_COLUMNS = {
  plan_id: 'PLAN_ID',
  enterprise_id: 'ENTERPRISE_ID',
  plan_code: 'PLAN_CODE',
  plan_name: 'PLAN_NAME',
  plan_type_code: 'PLAN_TYPE_CODE',
  status_code: 'STATUS_CODE',
  currency_code: 'CURRENCY_CODE',
  active_flag: 'ACTIVE_FLAG',
  owner_employee_id: 'OWNER_EMPLOYEE_ID',
  creation_date: 'CREATION_DATE',
  last_update_date: 'LAST_UPDATE_DATE'
};

export function enterpriseFilterColumnFromEnv() {
  const c = (process.env.COMP_PLANS_FULL_ENTERPRISE_COL || 'ENTERPRISE_ID').trim().toUpperCase();
  return c === 'TENANT_ID' ? 'TENANT_ID' : 'ENTERPRISE_ID';
}

function activeFlagPhysicalColumn() {
  const c = (process.env.COMP_PLANS_FULL_V_ACTIVE_COL || 'ACTIVE_FLAG').trim().toUpperCase();
  if (c === 'PLAN_ACTIVE_FLAG') return 'PLAN_ACTIVE_FLAG';
  return 'ACTIVE_FLAG';
}

function enterpriseSelectFragment() {
  const entCol = enterpriseFilterColumnFromEnv();
  if (entCol === 'TENANT_ID') return 'TENANT_ID AS ENTERPRISE_ID';
  return 'ENTERPRISE_ID';
}

function activeFlagSelectFragment() {
  const af = activeFlagPhysicalColumn();
  return af === 'ACTIVE_FLAG' ? 'ACTIVE_FLAG' : `${af} AS ACTIVE_FLAG`;
}

function planGuidMatchSql() {
  const fmt = (process.env.COMP_PLANS_FULL_V_GUID_FORMAT || 'RAW').trim().toUpperCase();
  if (fmt === 'VARCHAR' || fmt === 'STRING') {
    return 'UPPER(TRIM(v.PLAN_GUID)) = :plan_guid_hex';
  }
  return 'UPPER(RAWTOHEX(v.PLAN_GUID)) = :plan_guid_hex';
}

export function buildPlansFullViewHeaderSelectSql() {
  const ent = enterpriseSelectFragment();
  const af = activeFlagSelectFragment();
  return `
  PLAN_ID,
  PLAN_GUID,
  ${ent},
  PLAN_CODE,
  PLAN_NAME,
  PLAN_TYPE_CODE,
  STATUS_CODE,
  CURRENCY_CODE,
  ${af},
  OWNER_EMPLOYEE_ID,
  CREATED_BY,
  CREATION_DATE,
  LAST_UPDATED_BY,
  LAST_UPDATE_DATE
`
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapPlansFullViewDbError(err, context) {
  console.error(
    `[${LOG_TAG}] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  return new DatabaseError(err?.message || 'Database error', err, null);
}

function orderColumnForList(sort) {
  let col = PLANS_FULL_V_SORT_COLUMNS[sort.sortBy] || 'PLAN_ID';
  if (sort.sortBy === 'enterprise_id') {
    col = enterpriseFilterColumnFromEnv();
  }
  return `v.${col}`;
}

/**
 * @param {ReturnType<typeof buildPlansFullViewFilterValues>} filters
 */
function buildWhereSqlAndBinds(filters) {
  const entCol = enterpriseFilterColumnFromEnv();
  const parts = [`v.${entCol} = :enterprise_id`];
  const binds = {
    enterprise_id: { val: filters.enterprise_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  if (filters.plan_id != null) {
    parts.push('v.PLAN_ID = :plan_id');
    binds.plan_id = { val: filters.plan_id, type: oracledb.NUMBER, dir: oracledb.BIND_IN };
  }

  if (filters.plan_code != null) {
    parts.push('UPPER(TRIM(v.PLAN_CODE)) = UPPER(TRIM(:plan_code))');
    binds.plan_code = {
      val: filters.plan_code,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 4000
    };
  }

  if (filters.plan_name_pattern != null) {
    parts.push(`UPPER(v.PLAN_NAME) LIKE UPPER(:plan_name_pattern) ESCAPE '\\'`);
    binds.plan_name_pattern = {
      val: filters.plan_name_pattern,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 4000
    };
  }

  if (filters.plan_type_code != null) {
    parts.push('UPPER(TRIM(v.PLAN_TYPE_CODE)) = UPPER(TRIM(:plan_type_code))');
    binds.plan_type_code = {
      val: filters.plan_type_code,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 4000
    };
  }

  if (filters.status_code != null) {
    parts.push('UPPER(TRIM(v.STATUS_CODE)) = UPPER(TRIM(:status_code))');
    binds.status_code = {
      val: filters.status_code,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 4000
    };
  }

  if (filters.currency_code != null) {
    parts.push('UPPER(TRIM(v.CURRENCY_CODE)) = UPPER(TRIM(:currency_code))');
    binds.currency_code = {
      val: filters.currency_code,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 4000
    };
  }

  if (filters.active_flag != null) {
    parts.push(`UPPER(TRIM(v.${activeFlagPhysicalColumn()})) = UPPER(TRIM(:active_flag))`);
    binds.active_flag = {
      val: filters.active_flag,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: 10
    };
  }

  if (filters.owner_employee_id != null) {
    parts.push('v.OWNER_EMPLOYEE_ID = :owner_employee_id');
    binds.owner_employee_id = {
      val: filters.owner_employee_id,
      type: oracledb.NUMBER,
      dir: oracledb.BIND_IN
    };
  }

  if (filters.search_pattern != null) {
    const searchMax = Math.min(
      32767,
      Math.max(4000, String(filters.search_pattern).length + 64)
    );
    parts.push(`(
      UPPER(v.PLAN_CODE) LIKE UPPER(:search_pattern) ESCAPE '\\'
      OR UPPER(v.PLAN_NAME) LIKE UPPER(:search_pattern) ESCAPE '\\'
      OR UPPER(v.CURRENCY_CODE) LIKE UPPER(:search_pattern) ESCAPE '\\'
      OR UPPER(v.PLAN_TYPE_CODE) LIKE UPPER(:search_pattern) ESCAPE '\\'
    )`);
    binds.search_pattern = {
      val: filters.search_pattern,
      type: oracledb.STRING,
      dir: oracledb.BIND_IN,
      maxSize: searchMax
    };
  }

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   plan_id?: number|null,
 *   plan_code?: string|null,
 *   plan_name?: string|null,
 *   plan_type_code?: string|null,
 *   status_code?: string|null,
 *   currency_code?: string|null,
 *   active_flag?: string|null,
 *   owner_employee_id?: number|null,
 *   search_pattern?: string|null
 * }} input
 */
export function buildPlansFullViewFilterValues(input) {
  const enterprise_id = input.enterprise_id;
  if (!Number.isFinite(enterprise_id) || enterprise_id < 1) {
    throw new Error('enterprise_id must be a valid positive integer');
  }

  let plan_id = null;
  if (input.plan_id != null && input.plan_id !== '') {
    const n = Number(input.plan_id);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('plan_id must be a valid positive integer');
    }
    plan_id = n;
  }

  const trimOrNull = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  let plan_code = trimOrNull(input.plan_code);
  let plan_name_pattern = null;
  const planNameRaw = trimOrNull(input.plan_name);
  if (planNameRaw != null) {
    const esc = escapeLikePattern(planNameRaw);
    plan_name_pattern = `%${esc}%`;
  }

  let plan_type_code = trimOrNull(input.plan_type_code);
  if (plan_type_code != null) plan_type_code = plan_type_code.toUpperCase();

  let status_code = trimOrNull(input.status_code);
  if (status_code != null) status_code = status_code.toUpperCase();

  let currency_code = trimOrNull(input.currency_code);
  if (currency_code != null) currency_code = currency_code.toUpperCase();

  let active_flag = trimOrNull(input.active_flag);
  if (active_flag != null) {
    active_flag = active_flag.toUpperCase();
    if (active_flag !== 'Y' && active_flag !== 'N') {
      throw new Error('active_flag must be Y or N');
    }
  }

  let owner_employee_id = null;
  if (input.owner_employee_id != null && input.owner_employee_id !== '') {
    const n = Number(input.owner_employee_id);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('owner_employee_id must be a valid positive integer');
    }
    owner_employee_id = n;
  }

  let search_pattern = null;
  if (input.search != null && String(input.search).trim() !== '') {
    const esc = escapeLikePattern(String(input.search).trim());
    search_pattern = `%${esc}%`;
  }

  return {
    enterprise_id,
    plan_id,
    plan_code,
    plan_name_pattern,
    plan_type_code,
    status_code,
    currency_code,
    active_flag,
    owner_employee_id,
    search_pattern
  };
}

/**
 * @param {ReturnType<typeof buildPlansFullViewFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 * @param {{ selectSql: string, logLabel: string, fetchArraySize?: number, fromDetail?: boolean }} opts
 */
async function listPlansFullViewPaged(filters, pagination, sort, opts) {
  const { whereSql, binds: whereBinds } = buildWhereSqlAndBinds(filters);
  const { selectSql, logLabel, fetchArraySize, fromDetail } = opts;
  const rowOffset = (pagination.page - 1) * pagination.pageSize;
  const fetchSize = pagination.pageSize;
  const orderCol = orderColumnForList(sort);
  const orderDir = sort.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW_NAME} v ${whereSql}`;
  const selectClause = fromDetail === true ? 'v.*' : selectSql;
  const dataSql = `
SELECT ${selectClause}
FROM ${VIEW_NAME} v
${whereSql}
ORDER BY ${orderCol} ${orderDir} NULLS LAST
OFFSET :row_offset ROWS FETCH NEXT :fetch_size ROWS ONLY
`.trim();

  const dataBinds = {
    ...whereBinds,
    row_offset: { val: rowOffset, type: oracledb.NUMBER, dir: oracledb.BIND_IN },
    fetch_size: { val: fetchSize, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  const arraySize = fetchArraySize ?? Math.min(100, Math.max(10, fetchSize));

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
    throw wrapPlansFullViewDbError(err, logLabel);
  }
}

/**
 * @param {ReturnType<typeof buildPlansFullViewFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listPlansFullViewHeaders(filters, pagination, sort) {
  return listPlansFullViewPaged(filters, pagination, sort, {
    selectSql: buildPlansFullViewHeaderSelectSql(),
    logLabel: 'listPlansFullViewHeaders'
  });
}

/**
 * @param {ReturnType<typeof buildPlansFullViewFilterValues>} filters
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listPlansFullViewDetailRows(filters, pagination, sort) {
  const fetchSize = pagination.pageSize;
  return listPlansFullViewPaged(filters, pagination, sort, {
    selectSql: '*',
    fromDetail: true,
    logLabel: 'listPlansFullViewDetailRows',
    fetchArraySize: Math.min(25, Math.max(1, fetchSize))
  });
}

/**
 * @param {number} planId
 */
export async function getPlanFullViewRowByPlanId(planId) {
  const sql = `SELECT v.* FROM ${VIEW_NAME} v WHERE v.PLAN_ID = :plan_id`;
  const binds = {
    plan_id: { val: planId, type: oracledb.NUMBER, dir: oracledb.BIND_IN }
  };

  try {
    return await withCompSchemaConnection(async (connection) => {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return result.rows?.[0] ?? null;
    });
  } catch (err) {
    throw wrapPlansFullViewDbError(err, 'getPlanFullViewRowByPlanId');
  }
}

/**
 * @param {string} planGuidHex - 32-char uppercase hex
 */
export async function getPlanFullViewRowByPlanGuidHex(planGuidHex) {
  const sql = `SELECT v.* FROM ${VIEW_NAME} v WHERE ${planGuidMatchSql()}`;
  const binds = {
    plan_guid_hex: { val: planGuidHex, type: oracledb.STRING, dir: oracledb.BIND_IN, maxSize: 40 }
  };

  try {
    return await withCompSchemaConnection(async (connection) => {
      const result = await connection.execute(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT
      });
      return result.rows?.[0] ?? null;
    });
  } catch (err) {
    throw wrapPlansFullViewDbError(err, 'getPlanFullViewRowByPlanGuidHex');
  }
}
