import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementProcessingRuleListWhereClause } from '../utils/payElementProcessingRulesFilterBuilder.js';
import { resolvePayElementProcessingRulesUserMessage } from '../utils/payElementProcessingRulesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_PROCESSING_RULES';
const LOG_TAG = 'payElementProcessingRulesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element processing rules. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.PROCESSING_RULE_ID,
  v.PROCESSING_RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ENTERPRISE_ID,
  v.CLASSIFICATION_CODE,
  v.CATEGORY_CODE,
  v.FORMULA_ID,
  v.FORMULA_GUID,
  v.FORMULA_CODE,
  v.FORMULA_NAME,
  v.FORMULA_TYPE_CODE,
  v.FORMULA_ENGINE_CODE,
  v.RETURN_TYPE_CODE,
  v.RETURN_VALUE_CODE,
  v.FORMULA_STATUS,
  v.PROCESSING_TYPE_CODE,
  v.PRIORITY,
  v.PROCESSING_GROUP_CODE,
  v.EFFECTIVE_START_DATE,
  v.EFFECTIVE_END_DATE,
  v.LEGISLATIVE_DATA_GROUP,
  v.PROCESS_EVERY_PAYROLL_FLAG,
  v.RETROACTIVE_FLAG,
  v.PRORATION_FLAG,
  v.PROCESS_SEPARATELY_FLAG,
  v.INCLUDE_QUICKPAY_FLAG,
  v.INCLUDE_SIMULATION_FLAG,
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

/**
 * @param {Record<string, unknown>} row
 */
export function mapPayElementProcessingRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    processing_rule_id: toNumberOrNull(g('PROCESSING_RULE_ID')),
    processing_rule_guid: normalizeOutGuidHex(g('PROCESSING_RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    formula_id: toNumberOrNull(g('FORMULA_ID')),
    formula_guid: normalizeOutGuidHex(g('FORMULA_GUID')),
    formula_code: toStringOrNull(g('FORMULA_CODE')),
    formula_name: toStringOrNull(g('FORMULA_NAME')),
    formula_type_code: toStringOrNull(g('FORMULA_TYPE_CODE')),
    formula_engine_code: toStringOrNull(g('FORMULA_ENGINE_CODE')),
    return_type_code: toStringOrNull(g('RETURN_TYPE_CODE')),
    return_value_code: toStringOrNull(g('RETURN_VALUE_CODE')),
    formula_status: toStringOrNull(g('FORMULA_STATUS')),
    processing_type_code: toStringOrNull(g('PROCESSING_TYPE_CODE')),
    priority: toNumberOrNull(g('PRIORITY')),
    processing_group_code: toStringOrNull(g('PROCESSING_GROUP_CODE')),
    effective_start_date: toIsoDateOrNull(g('EFFECTIVE_START_DATE')),
    effective_end_date: toIsoDateOrNull(g('EFFECTIVE_END_DATE')),
    legislative_data_group: toStringOrNull(g('LEGISLATIVE_DATA_GROUP')),
    process_every_payroll_flag: toStringOrNull(g('PROCESS_EVERY_PAYROLL_FLAG')),
    retroactive_flag: toStringOrNull(g('RETROACTIVE_FLAG')),
    proration_flag: toStringOrNull(g('PRORATION_FLAG')),
    process_separately_flag: toStringOrNull(g('PROCESS_SEPARATELY_FLAG')),
    include_quickpay_flag: toStringOrNull(g('INCLUDE_QUICKPAY_FLAG')),
    include_simulation_flag: toStringOrNull(g('INCLUDE_SIMULATION_FLAG')),
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
export async function listPayElementProcessingRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementProcessingRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.PROCESSING_RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);

    return {
      rows: (dataResult.rows || []).map(mapPayElementProcessingRuleViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementProcessingRulesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementProcessingRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

/**
 * @param {string} processingRuleGuidHex
 * @param {number} [enterpriseId]
 */
export async function getPayElementProcessingRuleFromViewByGuid(processingRuleGuidHex, enterpriseId = null) {
  const whereParts = ['v.PROCESSING_RULE_GUID = :processing_rule_guid'];
  const binds = { processing_rule_guid: String(processingRuleGuidHex).trim().toUpperCase() };

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
    return row ? mapPayElementProcessingRuleViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementProcessingRuleFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementProcessingRulesUserMessage(null, err));
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
export async function existsProcessingRuleForElement(elementId, enterpriseId) {
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
    logOracleError(err, 'existsProcessingRuleForElement');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementProcessingRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
