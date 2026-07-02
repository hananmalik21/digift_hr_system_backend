import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementRetroRuleListWhereClause } from '../utils/payElementRetroRulesFilterBuilder.js';
import { resolvePayElementRetroRulesUserMessage } from '../utils/payElementRetroRulesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_RETRO_RULES';
const LOG_TAG = 'payElementRetroRulesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element retro rules. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.RETRO_RULE_ID,
  v.RETRO_RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ENTERPRISE_ID,
  v.CLASSIFICATION_CODE,
  v.CATEGORY_CODE,
  v.ENABLE_RETRO_FLAG,
  v.AUTO_RECALCULATE_FLAG,
  v.GENERATE_RETRO_ENTRIES_FLAG,
  v.CREATE_NOTIFICATION_FLAG,
  v.SALARY_CHANGE_FLAG,
  v.GRADE_CHANGE_FLAG,
  v.POSITION_CHANGE_FLAG,
  v.ASSIGNMENT_CHANGE_FLAG,
  v.ELEMENT_UPDATE_FLAG,
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
export function mapPayElementRetroRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    retro_rule_id: toNumberOrNull(g('RETRO_RULE_ID')),
    retro_rule_guid: normalizeOutGuidHex(g('RETRO_RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    enable_retro_flag: toStringOrNull(g('ENABLE_RETRO_FLAG')),
    auto_recalculate_flag: toStringOrNull(g('AUTO_RECALCULATE_FLAG')),
    generate_retro_entries_flag: toStringOrNull(g('GENERATE_RETRO_ENTRIES_FLAG')),
    create_notification_flag: toStringOrNull(g('CREATE_NOTIFICATION_FLAG')),
    salary_change_flag: toStringOrNull(g('SALARY_CHANGE_FLAG')),
    grade_change_flag: toStringOrNull(g('GRADE_CHANGE_FLAG')),
    position_change_flag: toStringOrNull(g('POSITION_CHANGE_FLAG')),
    assignment_change_flag: toStringOrNull(g('ASSIGNMENT_CHANGE_FLAG')),
    element_update_flag: toStringOrNull(g('ELEMENT_UPDATE_FLAG')),
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
export async function listPayElementRetroRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementRetroRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.RETRO_RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayElementRetroRuleViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementRetroRulesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementRetroRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} retroRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getPayElementRetroRuleFromViewByGuid(retroRuleGuidHex, enterpriseId = null) {
  const whereParts = ['v.RETRO_RULE_GUID = :retro_rule_guid'];
  const binds = { retro_rule_guid: String(retroRuleGuidHex).trim().toUpperCase() };

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
    return row ? mapPayElementRetroRuleViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementRetroRuleFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementRetroRulesUserMessage(null, err));
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
export async function existsRetroRuleForElement(elementId, enterpriseId) {
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
    logOracleError(err, 'existsRetroRuleForElement');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementRetroRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
