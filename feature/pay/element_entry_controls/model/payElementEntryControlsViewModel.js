import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementEntryControlListWhereClause } from '../utils/payElementEntryControlsFilterBuilder.js';
import { resolvePayElementEntryControlsUserMessage } from '../utils/payElementEntryControlsOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_ENTRY_CONTROLS';
const LOG_TAG = 'payElementEntryControlsViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element entry controls. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.ENTRY_CONTROL_ID,
  v.ENTRY_CONTROL_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ENTERPRISE_ID,
  v.CLASSIFICATION_CODE,
  v.CATEGORY_CODE,
  v.MAX_ENTRIES_ALLOWED,
  v.MIN_VALUE,
  v.MAX_VALUE,
  v.DEFAULT_VALUE,
  v.ALLOW_MULTIPLE_ENTRIES_FLAG,
  v.ALLOW_OVERRIDE_FLAG,
  v.USER_ENTERABLE_FLAG,
  v.MANDATORY_ENTRY_FLAG,
  v.REQUIRE_APPROVAL_FLAG,
  v.AUTO_GENERATE_ENTRY_FLAG,
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
export function mapPayElementEntryControlViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    entry_control_id: toNumberOrNull(g('ENTRY_CONTROL_ID')),
    entry_control_guid: normalizeOutGuidHex(g('ENTRY_CONTROL_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    max_entries_allowed: toNumberOrNull(g('MAX_ENTRIES_ALLOWED')),
    min_value: toNumberOrNull(g('MIN_VALUE')),
    max_value: toNumberOrNull(g('MAX_VALUE')),
    default_value: toNumberOrNull(g('DEFAULT_VALUE')),
    allow_multiple_entries_flag: toStringOrNull(g('ALLOW_MULTIPLE_ENTRIES_FLAG')),
    allow_override_flag: toStringOrNull(g('ALLOW_OVERRIDE_FLAG')),
    user_enterable_flag: toStringOrNull(g('USER_ENTERABLE_FLAG')),
    mandatory_entry_flag: toStringOrNull(g('MANDATORY_ENTRY_FLAG')),
    require_approval_flag: toStringOrNull(g('REQUIRE_APPROVAL_FLAG')),
    auto_generate_entry_flag: toStringOrNull(g('AUTO_GENERATE_ENTRY_FLAG')),
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
export async function listPayElementEntryControlsFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementEntryControlListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.ENTRY_CONTROL_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayElementEntryControlViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementEntryControlsFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementEntryControlsUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} entryControlGuidHex
 * @param {number} [enterpriseId]
 */
export async function getPayElementEntryControlFromViewByGuid(entryControlGuidHex, enterpriseId = null) {
  const whereParts = ['v.ENTRY_CONTROL_GUID = :entry_control_guid'];
  const binds = { entry_control_guid: String(entryControlGuidHex).trim().toUpperCase() };

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
    return row ? mapPayElementEntryControlViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementEntryControlFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementEntryControlsUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {number} elementId
 * @param {number} enterpriseId
 */
export async function existsEntryControlForElement(elementId, enterpriseId) {
  const sql = `
SELECT 1 AS FOUND
  FROM ${VIEW} v
 WHERE v.ELEMENT_ID = :element_id
   AND v.ENTERPRISE_ID = :enterprise_id
 FETCH FIRST 1 ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      sql,
      { element_id: elementId, enterprise_id: enterpriseId },
      ROW_OBJECT
    );
    return Boolean(result.rows?.length);
  } catch (err) {
    logOracleError(err, 'existsEntryControlForElement');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementEntryControlsUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
