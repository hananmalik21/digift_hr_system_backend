import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementProrationRuleListWhereClause } from '../utils/payElementProrationRulesFilterBuilder.js';
import { resolvePayElementProrationRulesUserMessage } from '../utils/payElementProrationRulesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_PRORATION_RULES';
const LOG_TAG = 'payElementProrationRulesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element proration rules. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.PRORATION_RULE_ID,
  v.PRORATION_RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ENTERPRISE_ID,
  v.CLASSIFICATION_CODE,
  v.CATEGORY_CODE,
  v.PRORATION_METHOD_CODE,
  v.PRORATION_FORMULA,
  v.EFFECTIVE_DATE_RULE,
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

export function mapPayElementProrationRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    proration_rule_id: toNumberOrNull(g('PRORATION_RULE_ID')),
    proration_rule_guid: normalizeOutGuidHex(g('PRORATION_RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    proration_method_code: toStringOrNull(g('PRORATION_METHOD_CODE')),
    proration_formula: toStringOrNull(g('PRORATION_FORMULA')),
    effective_date_rule: toStringOrNull(g('EFFECTIVE_DATE_RULE')),
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
    row.TOTAL_RECORDS ?? row.total_records ?? row.CNT ?? row.count ?? Object.values(row).find((v) => v != null);
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function logOracleError(err, context) {
  const code = err?.errorNum != null ? `ORA-${err.errorNum}` : 'ORA-UNKNOWN';
  console.error(`[${LOG_TAG}] ${context} ${code}`, err?.message || err);
}

export async function listPayElementProrationRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementProrationRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.PRORATION_RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);
    return {
      rows: (dataResult.rows || []).map(mapPayElementProrationRuleViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementProrationRulesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementProrationRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

export async function getPayElementProrationRuleFromViewByGuid(prorationRuleGuidHex) {
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE UPPER(v.PRORATION_RULE_GUID) = :proration_rule_guid`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      sql,
      { proration_rule_guid: String(prorationRuleGuidHex).trim().toUpperCase() },
      ROW_OBJECT
    );
    const row = result.rows?.[0];
    return row ? mapPayElementProrationRuleViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementProrationRuleFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementProrationRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
