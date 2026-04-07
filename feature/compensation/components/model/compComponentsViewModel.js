/**
 * Read-only access to COMP.COMPONENTS_VIEW (component master + advanced settings).
 * No joins to ENT or business-unit views.
 */

import db from '../../../../config/db.js';
import oracledb from 'oracledb';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeComponentForGetResponse } from '../normalizeComponentGetResponse.js';

const SCHEMA = 'COMP';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Upper bound on list `search` input length (LIKE pattern safety). */
export const COMPONENTS_LIST_SEARCH_MAX_LEN = 200;

const LIKE_ESCAPE_SUFFIX = ` ESCAPE '\\'`;

/**
 * Select all columns from the view so we do not ORA-00904 when DB column names differ slightly.
 * mapComponentsViewRow normalizes known aliases (e.g. ACTIVE_FLAG vs COMPONENT_ACTIVE_FLAG).
 */
const VIEW_SELECT_SQL = `SELECT v.* FROM COMP.COMPONENTS_VIEW v`;

/**
 * SQL expression for the component row active Y/N column (ORDER BY component_active_flag).
 * Default matches COMP.COMP_COMPONENTS.ACTIVE_FLAG. Set env COMP_COMPONENTS_VIEW_ACTIVE_COL if the view uses COMPONENT_ACTIVE_FLAG only.
 */
function activeFlagExpr() {
  const col = (process.env.COMP_COMPONENTS_VIEW_ACTIVE_COL || '').trim().toUpperCase();
  if (col === 'COMPONENT_ACTIVE_FLAG') return 'v.COMPONENT_ACTIVE_FLAG';
  return 'v.ACTIVE_FLAG';
}

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

/**
 * Maps DB row to API shape. Dates → ISO-8601; RAW(16) GUIDs via Buffer from driver.
 */
export function mapComponentsViewRow(row) {
  if (!row) return null;

  const r = rowKeysUpper(row);
  const g = (k) => r[k];

  const toIso = (d) => {
    if (d == null) return null;
    if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString();
    return null;
  };

  const hex = (v) => {
    if (v == null) return null;
    if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
    const s = String(v).trim();
    return s || null;
  };

  const componentGuid = hex(g('COMPONENT_GUID'));
  const advSettingGuid = hex(g('ADV_SETTING_GUID') ?? g('SETTING_GUID'));

  const componentActive =
    g('COMPONENT_ACTIVE_FLAG') != null ? g('COMPONENT_ACTIVE_FLAG') : g('ACTIVE_FLAG');

  const descRaw = g('DESCRIPTION') ?? g('COMPONENT_DESCRIPTION');
  return normalizeComponentForGetResponse({
    component_id: g('COMPONENT_ID') != null ? Number(g('COMPONENT_ID')) : null,
    component_guid: componentGuid,
    component_code: g('COMPONENT_CODE') != null ? String(g('COMPONENT_CODE')) : null,
    component_name: g('COMPONENT_NAME') != null ? String(g('COMPONENT_NAME')) : null,
    description:
      descRaw != null && String(descRaw).trim() !== '' ? String(descRaw).trim() : null,
    component_type_code: g('COMPONENT_TYPE_CODE') != null ? String(g('COMPONENT_TYPE_CODE')) : null,
    calculation_method_code:
      g('CALCULATION_METHOD_CODE') != null ? String(g('CALCULATION_METHOD_CODE')) : null,
    base_amount_source: g('BASE_AMOUNT_SOURCE') != null ? String(g('BASE_AMOUNT_SOURCE')) : null,
    formula_name: g('FORMULA_NAME') != null ? String(g('FORMULA_NAME')) : null,
    min_value: g('MIN_VALUE') != null ? Number(g('MIN_VALUE')) : null,
    max_value: g('MAX_VALUE') != null ? Number(g('MAX_VALUE')) : null,
    currency_code: g('CURRENCY_CODE') != null ? String(g('CURRENCY_CODE')) : null,
    status: g('STATUS') != null ? String(g('STATUS')) : null,
    tenant_id: g('TENANT_ID') != null ? Number(g('TENANT_ID')) : null,
    comp_category_code: g('COMP_CATEGORY_CODE') != null ? String(g('COMP_CATEGORY_CODE')) : null,
    effective_start_date: toIso(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIso(g('EFFECTIVE_END_DATE')),
    component_active_flag: componentActive != null ? String(componentActive) : null,
    adv_setting_id:
      g('ADV_SETTING_ID') != null
        ? Number(g('ADV_SETTING_ID'))
        : g('SETTING_ID') != null
          ? Number(g('SETTING_ID'))
          : null,
    adv_setting_guid: advSettingGuid,
    recurring_flag: g('RECURRING_FLAG') != null ? String(g('RECURRING_FLAG')) : null,
    optional_flag: g('OPTIONAL_FLAG') != null ? String(g('OPTIONAL_FLAG')) : null,
    pensionable_flag: g('PENSIONABLE_FLAG') != null ? String(g('PENSIONABLE_FLAG')) : null,
    statutory_flag: g('STATUTORY_FLAG') != null ? String(g('STATUTORY_FLAG')) : null,
    include_in_ctc_flag: g('INCLUDE_IN_CTC_FLAG') != null ? String(g('INCLUDE_IN_CTC_FLAG')) : null,
    prorated_flag: g('PRORATED_FLAG') != null ? String(g('PRORATED_FLAG')) : null,
    taxable_flag: g('TAXABLE_FLAG') != null ? String(g('TAXABLE_FLAG')) : null,
    adv_active_flag: g('ADV_ACTIVE_FLAG') != null ? String(g('ADV_ACTIVE_FLAG')) : null,
    created_by: g('CREATED_BY') != null ? String(g('CREATED_BY')) : null,
    creation_date: toIso(g('CREATION_DATE')),
    last_updated_by: g('LAST_UPDATED_BY') != null ? String(g('LAST_UPDATED_BY')) : null,
    last_update_date: toIso(g('LAST_UPDATE_DATE'))
  });
}

async function runCompRead(fn) {
  const connection = await db.getConnection();
  try {
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = ${SCHEMA}`,
      [],
      { autoCommit: true }
    );
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function wrapDbError(err, context) {
  console.error(
    `[compComponentsViewModel] ${context}`,
    err?.errorNum != null ? `ORA-${err.errorNum}` : '',
    err?.message || err
  );
  return new DatabaseError(
    err?.message || 'Database error',
    err,
    'Unable to load compensation components. Please try again later.'
  );
}

/** Allowed ORDER BY columns (API sort_by → SQL). */
export const COMPONENTS_VIEW_SORT_COLUMNS = {
  component_id: 'v.COMPONENT_ID',
  component_code: 'v.COMPONENT_CODE',
  component_name: 'v.COMPONENT_NAME',
  description: 'v.DESCRIPTION',
  component_type_code: 'v.COMPONENT_TYPE_CODE',
  calculation_method_code: 'v.CALCULATION_METHOD_CODE',
  currency_code: 'v.CURRENCY_CODE',
  status: 'v.STATUS',
  tenant_id: 'v.TENANT_ID',
  comp_category_code: 'v.COMP_CATEGORY_CODE',
  effective_start_date: 'v.EFFECTIVE_START_DATE',
  effective_end_date: 'v.EFFECTIVE_END_DATE',
  component_active_flag: activeFlagExpr(),
  creation_date: 'v.CREATION_DATE',
  last_update_date: 'v.LAST_UPDATE_DATE'
};

/**
 * Escape LIKE wildcards for Oracle LIKE ... ESCAPE '\\'
 */
export function escapeLikePattern(raw) {
  const s = String(raw ?? '').slice(0, COMPONENTS_LIST_SEARCH_MAX_LEN);
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Case-insensitive substring match on a column (Oracle UPPER + LIKE).
 * @param {string} colExpr - e.g. v.COMPONENT_CODE
 * @param {string} patBindToken - bound placeholder e.g. :b0
 */
function upperLikeContains(colExpr, patBindToken) {
  return `UPPER(${colExpr}) LIKE UPPER(${patBindToken})${LIKE_ESCAPE_SUFFIX}`;
}

function appendListSearchCondition(conditions, bindFn, rawSearch) {
  const term = String(rawSearch ?? '').trim();
  if (term === '') return;
  const esc = escapeLikePattern(term);
  const pat = bindFn(`%${esc}%`);
  conditions.push(`(
    ${upperLikeContains('v.COMPONENT_CODE', pat)}
    OR ${upperLikeContains('v.COMPONENT_NAME', pat)}
    OR (v.COMP_CATEGORY_CODE IS NOT NULL AND ${upperLikeContains('v.COMP_CATEGORY_CODE', pat)})
  )`);
}

/**
 * @param {object} filters - tenant_id (required), optional search, comp_category_code, status, calculation_method_code
 * @param {{ page: number, pageSize: number }} pagination
 * @param {{ sortBy: string, sortOrder: 'ASC'|'DESC' }} sort
 */
export async function listComponentsFromView(filters, pagination, sort) {
  const conditions = [];
  const binds = {};
  let bi = 0;
  const bind = (val) => {
    const name = `b${bi++}`;
    binds[name] = val;
    return `:${name}`;
  };

  const addEq = (colExpr, val, { nullMatch = false } = {}) => {
    if (val === undefined) return;
    if (val === null) {
      if (nullMatch) conditions.push(`${colExpr} IS NULL`);
      return;
    }
    conditions.push(`${colExpr} = ${bind(val)}`);
  };

  addEq('v.TENANT_ID', filters.tenant_id);
  addEq('v.COMP_CATEGORY_CODE', filters.comp_category_code, { nullMatch: true });
  addEq('v.STATUS', filters.status, { nullMatch: true });
  addEq('v.CALCULATION_METHOD_CODE', filters.calculation_method_code, { nullMatch: true });

  appendListSearchCondition(conditions, bind, filters.search);

  const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const orderCol = COMPONENTS_VIEW_SORT_COLUMNS[sort.sortBy] || 'v.COMPONENT_ID';
  const orderDir = sort.sortOrder === 'ASC' ? 'ASC' : 'DESC';

  const countSql = `SELECT COUNT(*) AS CNT FROM COMP.COMPONENTS_VIEW v ${whereSql}`;
  const dataSql = `${VIEW_SELECT_SQL} ${whereSql} ORDER BY ${orderCol} ${orderDir} NULLS LAST OFFSET :off ROWS FETCH NEXT :lim ROWS ONLY`;

  const offset = (pagination.page - 1) * pagination.pageSize;

  try {
    return await runCompRead(async (connection) => {
      const countResult = await connection.execute(countSql, binds, ROW_OBJECT);
      const total = Number(countResult.rows?.[0]?.CNT ?? 0);

      const dataBinds = { ...binds, off: offset, lim: pagination.pageSize };
      const dataResult = await connection.execute(dataSql, dataBinds, ROW_OBJECT);
      const rows = (dataResult.rows || []).map(mapComponentsViewRow);
      return { rows, total };
    });
  } catch (err) {
    throw wrapDbError(err, 'listComponentsFromView');
  }
}

export async function getComponentByIdFromView(componentId, tenantId) {
  const id = Number(componentId);
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return null;
  }
  const sql = `${VIEW_SELECT_SQL} WHERE v.COMPONENT_ID = :id AND v.TENANT_ID = :tid`;
  try {
    return await runCompRead(async (connection) => {
      const result = await connection.execute(sql, { id, tid }, ROW_OBJECT);
      const row = result.rows?.[0];
      return row ? mapComponentsViewRow(row) : null;
    });
  } catch (err) {
    throw wrapDbError(err, 'getComponentByIdFromView');
  }
}
