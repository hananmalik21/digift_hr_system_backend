import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementScopeRuleListWhereClause } from '../utils/payElementScopeRulesFilterBuilder.js';
import { resolvePayElementScopeRulesUserMessage } from '../utils/payElementScopeRulesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_SCOPE_RULES';
const LOG_TAG = 'payElementScopeRulesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element scope rules. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.SCOPE_RULE_ID,
  v.SCOPE_RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.ENTERPRISE_ID,
  v.CLASSIFICATION_CODE,
  v.CATEGORY_CODE,
  v.SCOPE_LEVEL_CODE,
  v.PAYROLL_ID,
  v.PAYROLL_CODE,
  v.PAYROLL_NAME,
  v.LEGAL_EMPLOYER_GUID,
  v.LEGAL_EMPLOYER_CODE,
  v.LEGAL_EMPLOYER_NAME,
  v.ORG_UNIT_GUID,
  v.ORG_UNIT_CODE,
  v.ORG_UNIT_NAME,
  v.GRADE_ID,
  v.GRADE_NUMBER,
  v.GRADE_NAME,
  v.POSITION_GUID,
  v.POSITION_CODE,
  v.POSITION_NAME,
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
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const s = String(value).trim();
  return s || null;
}

export function mapPayElementScopeRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    scope_rule_id: toNumberOrNull(g('SCOPE_RULE_ID')),
    scope_rule_guid: normalizeOutGuidHex(g('SCOPE_RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID')),
    classification_code: toStringOrNull(g('CLASSIFICATION_CODE')),
    category_code: toStringOrNull(g('CATEGORY_CODE')),
    scope_level_code: toStringOrNull(g('SCOPE_LEVEL_CODE')),
    payroll_id: toNumberOrNull(g('PAYROLL_ID')),
    payroll_code: toStringOrNull(g('PAYROLL_CODE')),
    payroll_name: toStringOrNull(g('PAYROLL_NAME')),
    legal_employer_id: normalizeOutGuidHex(g('LEGAL_EMPLOYER_GUID')),
    legal_employer_code: toStringOrNull(g('LEGAL_EMPLOYER_CODE')),
    legal_employer_name: toStringOrNull(g('LEGAL_EMPLOYER_NAME')),
    org_unit_id: normalizeOutGuidHex(g('ORG_UNIT_GUID')),
    org_unit_code: toStringOrNull(g('ORG_UNIT_CODE')),
    org_unit_name: toStringOrNull(g('ORG_UNIT_NAME')),
    grade_id: toNumberOrNull(g('GRADE_ID')),
    grade_number: toNumberOrNull(g('GRADE_NUMBER')),
    grade_name: toStringOrNull(g('GRADE_NAME')),
    position_id: normalizeOutGuidHex(g('POSITION_GUID')),
    position_code: toStringOrNull(g('POSITION_CODE')),
    position_name: toStringOrNull(g('POSITION_NAME')),
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

export async function listPayElementScopeRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementScopeRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.SCOPE_RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);
    return {
      rows: (dataResult.rows || []).map(mapPayElementScopeRuleViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementScopeRulesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementScopeRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

export async function getPayElementScopeRuleFromViewByGuid(scopeRuleGuidHex, enterpriseId = null) {
  const whereParts = ['v.SCOPE_RULE_GUID = :scope_rule_guid'];
  const binds = { scope_rule_guid: String(scopeRuleGuidHex).trim().toUpperCase() };
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
    return row ? mapPayElementScopeRuleViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementScopeRuleFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementScopeRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
