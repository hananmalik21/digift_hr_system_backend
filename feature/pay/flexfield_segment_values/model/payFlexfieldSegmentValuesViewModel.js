import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildFlexfieldSegmentValueListWhereClause } from '../utils/payFlexfieldSegmentValuesFilterBuilder.js';
import { resolveFlexfieldSegmentValueUserMessage } from '../utils/payFlexfieldSegmentValuesOracleErrors.js';

const VIEW = 'PAY.V_FLEXFIELD_SEGMENT_VALUES';
const LOG_TAG = 'payFlexfieldSegmentValuesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch flexfield segment values. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.SEGMENT_VALUE_ID,
  v.SEGMENT_VALUE_GUID,
  v.SEGMENT_ID,
  v.SEGMENT_GUID,
  v.ENTERPRISE_ID,
  v.SEGMENT_CODE,
  v.SEGMENT_NAME,
  v.VALUE_CODE,
  v.VALUE_NAME,
  v.DESCRIPTION,
  v.ENABLED_FLAG,
  v.ENABLED_FLAG_DISPLAY,
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
export function mapFlexfieldSegmentValueViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    segment_value_id: toNumberOrNull(g('SEGMENT_VALUE_ID')),
    segment_value_guid: normalizeOutGuidHex(g('SEGMENT_VALUE_GUID')),
    segment_id: toNumberOrNull(g('SEGMENT_ID')),
    segment_guid: normalizeOutGuidHex(g('SEGMENT_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    segment_code: toStringOrNull(g('SEGMENT_CODE')),
    segment_name: toStringOrNull(g('SEGMENT_NAME')),
    value_code: toStringOrNull(g('VALUE_CODE')),
    value_name: toStringOrNull(g('VALUE_NAME')),
    description: toStringOrNull(g('DESCRIPTION')),
    enabled_flag: toStringOrNull(g('ENABLED_FLAG')),
    enabled_flag_display: toStringOrNull(g('ENABLED_FLAG_DISPLAY')),
    created_by: toStringOrNull(g('CREATED_BY')),
    creation_date: toIsoDateTimeOrNull(g('CREATION_DATE')),
    last_updated_by: toStringOrNull(g('LAST_UPDATED_BY')),
    last_update_date: toIsoDateTimeOrNull(g('LAST_UPDATE_DATE'))
  };
}

/** @param {Record<string, unknown>} row */
export function mapFlexfieldSegmentValueLookupRow(row) {
  const mapped = mapFlexfieldSegmentValueViewRow(row);
  return {
    value_code: mapped.value_code,
    value_name: mapped.value_name
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
export async function listFlexfieldSegmentValuesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildFlexfieldSegmentValueListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.SEGMENT_VALUE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapFlexfieldSegmentValueViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listFlexfieldSegmentValuesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentValueUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {object} filters
 */
export async function listFlexfieldSegmentValuesLookupBySegmentCode(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildFlexfieldSegmentValueListWhereClause({
    ...filters,
    sort_by: filters.sort_by ?? 'value_name',
    sort_order: filters.sort_order ?? 'ASC'
  });

  const dataSql = `
SELECT v.VALUE_CODE, v.VALUE_NAME
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.VALUE_CODE ASC`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(dataSql, binds, ROW_OBJECT);
    return (result.rows || []).map(mapFlexfieldSegmentValueLookupRow);
  } catch (err) {
    logOracleError(err, 'listFlexfieldSegmentValuesLookupBySegmentCode');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentValueUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} segmentValueGuidHex
 * @param {number} [enterpriseId]
 */
export async function getFlexfieldSegmentValueFromViewByGuid(segmentValueGuidHex, enterpriseId = null) {
  const whereParts = ['v.SEGMENT_VALUE_GUID = :segment_value_guid'];
  const binds = { segment_value_guid: String(segmentValueGuidHex).trim().toUpperCase() };

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
    return row ? mapFlexfieldSegmentValueViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getFlexfieldSegmentValueFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentValueUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
