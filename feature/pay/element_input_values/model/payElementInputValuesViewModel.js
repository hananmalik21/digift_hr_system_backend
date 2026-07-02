import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementInputValueListWhereClause } from '../utils/payElementInputValuesFilterBuilder.js';
import { resolvePayElementInputValuesUserMessage } from '../utils/payElementInputValuesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_INPUT_VALUES';
const LOG_TAG = 'payElementInputValuesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element input values. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.INPUT_VALUE_ID,
  v.INPUT_VALUE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ENTERPRISE_ID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.CLASSIFICATION_CODE,
  v.INPUT_VALUE_NAME,
  v.DATA_TYPE_CODE,
  v.DEFAULT_VALUE,
  v.MIN_VALUE,
  v.MAX_VALUE,
  v.VALIDATION_FORMULA,
  v.REQUIRED_FLAG,
  v.USER_ENTERABLE_FLAG,
  v.DISPLAY_SEQUENCE,
  v.STATUS,
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

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayElementInputValueViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    input_value_id: toNumberOrNull(g('INPUT_VALUE_ID')),
    input_value_guid: normalizeOutGuidHex(g('INPUT_VALUE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    input_value_name: toStringOrNull(g('INPUT_VALUE_NAME')),
    data_type_code: toStringOrNull(g('DATA_TYPE_CODE')),
    default_value: toStringOrNull(g('DEFAULT_VALUE')),
    min_value: toNumberOrNull(g('MIN_VALUE')),
    max_value: toNumberOrNull(g('MAX_VALUE')),
    validation_formula: toStringOrNull(g('VALIDATION_FORMULA')),
    required_flag: toStringOrNull(g('REQUIRED_FLAG')),
    user_enterable_flag: toStringOrNull(g('USER_ENTERABLE_FLAG')),
    display_sequence: toNumberOrNull(g('DISPLAY_SEQUENCE')),
    status: toStringOrNull(g('STATUS')),
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
 */
export async function listPayElementInputValuesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementInputValueListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.INPUT_VALUE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayElementInputValueViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementInputValuesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementInputValuesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} inputValueGuidHex
 * @param {number} [enterpriseId]
 */
export async function getPayElementInputValueFromViewByGuid(inputValueGuidHex, enterpriseId = null) {
  const whereParts = ['v.INPUT_VALUE_GUID = :input_value_guid'];
  const binds = { input_value_guid: String(inputValueGuidHex).trim().toUpperCase() };

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
    return row ? mapPayElementInputValueViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementInputValueFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementInputValuesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
