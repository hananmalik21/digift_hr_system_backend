import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementsListWhereClause } from '../utils/payElementsFilterBuilder.js';
import { resolvePayElementsUserMessage } from '../utils/payElementsOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENTS';
const LOG_TAG = 'payElementsViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch pay elements. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ENTERPRISE_ID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.DESCRIPTION,
  v.CATEGORY_CODE,
  v.CLASSIFICATION_CODE,
  v.SECONDARY_CLASSIFICATION,
  v.LEGISLATIVE_DATA_GROUP,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.RECURRING_FLAG,
  v.COSTABLE_FLAG,
  v.TAXABLE_FLAG,
  v.PENSIONABLE_FLAG,
  v.RETRO_ENABLED_FLAG,
  v.PRORATION_ENABLED_FLAG,
  v.PRIORITY,
  v.PROCESSING_FREQUENCY,
  v.COSTING_JSON,
  v.CREATED_BY,
  v.CREATION_DATE,
  v.LAST_UPDATED_BY,
  v.LAST_UPDATE_DATE
`.trim();

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row || {})) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function toIsoDateOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value).trim();
  return s ? s.slice(0, 10) : null;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

async function readClobValue(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value.getData === 'function') {
    const p = value.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => value.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return String(value);
}

/**
 * @param {unknown} raw
 * @returns {Array<Record<string, unknown>>}
 */
function parseCostingJson(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const text = typeof raw === 'string' ? raw.trim() : null;
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * @param {Record<string, unknown>} row
 */
export async function mapPayElementViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];
  const costingRaw = await readClobValue(g('COSTING_JSON'));

  return {
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    description: toStringOrNull(g('DESCRIPTION')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    secondary_classification: toStringOrNull(g('SECONDARY_CLASSIFICATION')),
    legislative_data_group: toStringOrNull(g('LEGISLATIVE_DATA_GROUP')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    processing_controls: {
      recurring_flag: toStringOrNull(g('RECURRING_FLAG')),
      costable_flag: toStringOrNull(g('COSTABLE_FLAG')),
      taxable_flag: toStringOrNull(g('TAXABLE_FLAG')),
      pensionable_flag: toStringOrNull(g('PENSIONABLE_FLAG')),
      retro_enabled_flag: toStringOrNull(g('RETRO_ENABLED_FLAG')),
      proration_enabled_flag: toStringOrNull(g('PRORATION_ENABLED_FLAG')),
      priority: toNumberOrNull(g('PRIORITY')),
      processing_frequency: toStringOrNull(g('PROCESSING_FREQUENCY'))
    },
    costing_values: parseCostingJson(costingRaw),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

function readScalarCount(result) {
  const row = result?.rows?.[0];
  if (row == null || typeof row !== 'object') return 0;
  const value =
    row.TOTAL_RECORDS ??
    row.total_records ??
    row.CNT ??
    row.cnt ??
    row.COUNT ??
    row.count ??
    Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

/**
 * @param {object} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listPayElementsFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementsListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.ELEMENT_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  const filterBinds = { ...binds };
  const dataBinds = {
    ...filterBinds,
    skip_rows: skipRows,
    fetch_next: filters.limit
  };

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, filterBinds, ROW_OBJECT),
      connection.execute(dataSql, dataBinds, ROW_OBJECT)
    ]);

    const rows = await Promise.all((dataResult.rows || []).map(mapPayElementViewRow));

    return {
      rows,
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementsFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementsUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} elementGuidHex
 * @param {number} [enterpriseId]
 * @returns {Promise<object|null>}
 */
export async function getPayElementFromViewByGuid(elementGuidHex, enterpriseId = null) {
  const whereParts = ['v.ELEMENT_GUID = :element_guid'];
  const binds = { element_guid: String(elementGuidHex).trim().toUpperCase() };

  if (enterpriseId != null) {
    whereParts.push('v.ENTERPRISE_ID = :enterprise_id');
    binds.enterprise_id = enterpriseId;
  }

  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE ${whereParts.join(' AND ')}`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, binds, ROW_OBJECT);
    const row = result.rows?.[0];
    return row ? await mapPayElementViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementsUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
