import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildFlexfieldSegmentListWhereClause } from '../utils/payFlexfieldSegmentsFilterBuilder.js';
import { resolveFlexfieldSegmentUserMessage } from '../utils/payFlexfieldSegmentsOracleErrors.js';

const VIEW = 'PAY.V_FLEXFIELD_STRUCTURE_SEGMENTS';
const LOG_TAG = 'payFlexfieldSegmentsViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch flexfield segments. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.SEGMENT_ID,
  v.SEGMENT_GUID,
  v.ENTERPRISE_ID,
  v.SEGMENT_NAME,
  v.SEGMENT_CODE,
  v.DESCRIPTION,
  v.DATA_TYPE,
  v.MAX_LENGTH,
  v.DISPLAY_SEQUENCE,
  v.REQUIRED_FLAG,
  v.REQUIRED_FLAG_DISPLAY,
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
export function mapFlexfieldSegmentViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    segment_id: toNumberOrNull(g('SEGMENT_ID')),
    segment_guid: normalizeOutGuidHex(g('SEGMENT_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    segment_name: toStringOrNull(g('SEGMENT_NAME')),
    segment_code: toStringOrNull(g('SEGMENT_CODE')),
    description: toStringOrNull(g('DESCRIPTION')),
    data_type: toStringOrNull(g('DATA_TYPE')),
    max_length: toNumberOrNull(g('MAX_LENGTH')),
    display_sequence: toNumberOrNull(g('DISPLAY_SEQUENCE')),
    required_flag: toStringOrNull(g('REQUIRED_FLAG')),
    required_flag_display: toStringOrNull(g('REQUIRED_FLAG_DISPLAY')),
    enabled_flag: toStringOrNull(g('ENABLED_FLAG')),
    enabled_flag_display: toStringOrNull(g('ENABLED_FLAG_DISPLAY')),
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
export async function listFlexfieldSegmentsFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildFlexfieldSegmentListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.SEGMENT_ID ASC
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

    return {
      rows: (dataResult.rows || []).map(mapFlexfieldSegmentViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listFlexfieldSegmentsFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} segmentGuidHex
 * @param {number} [enterpriseId]
 * @returns {Promise<object|null>}
 */
export async function getFlexfieldSegmentFromViewByGuid(segmentGuidHex, enterpriseId = null) {
  const whereParts = ['v.SEGMENT_GUID = :segment_guid'];
  const binds = { segment_guid: String(segmentGuidHex).trim().toUpperCase() };

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
    return row ? mapFlexfieldSegmentViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getFlexfieldSegmentFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolveFlexfieldSegmentUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
