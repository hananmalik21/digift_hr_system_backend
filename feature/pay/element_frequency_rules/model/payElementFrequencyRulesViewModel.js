import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { normalizeOutGuidHex } from '../../../../utils/oraclePackageUtils.js';
import { buildPayElementFrequencyRuleListWhereClause } from '../utils/payElementFrequencyRulesFilterBuilder.js';
import { resolvePayElementFrequencyRulesUserMessage } from '../utils/payElementFrequencyRulesOracleErrors.js';

const VIEW = 'PAY.V_PAY_ELEMENT_FREQUENCY_RULES';
const LOG_TAG = 'payElementFrequencyRulesViewModel';
const GENERIC_ERROR_MESSAGE = 'Unable to fetch element frequency rules. Please try again.';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

const VIEW_SELECT_COLUMNS = `
  v.FREQUENCY_RULE_ID,
  v.FREQUENCY_RULE_GUID,
  v.ELEMENT_ID,
  v.ELEMENT_GUID,
  v.ELEMENT_CODE,
  v.ELEMENT_NAME,
  v.FREQUENCY_TYPE_CODE,
  v.FREQUENCY_FORMULA,
  v.EFFECTIVE_DATE,
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
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function toIsoDateTimeOrNull(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  const s = String(value).trim();
  return s || null;
}

export function mapPayElementFrequencyRuleViewRow(row) {
  const r = rowKeysUpper(row);
  const g = (key) => r[key];

  return {
    frequency_rule_id: toNumberOrNull(g('FREQUENCY_RULE_ID')),
    frequency_rule_guid: normalizeOutGuidHex(g('FREQUENCY_RULE_GUID')),
    element_id: toNumberOrNull(g('ELEMENT_ID')),
    element_guid: normalizeOutGuidHex(g('ELEMENT_GUID')),
    element_code: toStringOrNull(g('ELEMENT_CODE')),
    element_name: toStringOrNull(g('ELEMENT_NAME')),
    frequency_type_code: toStringOrNull(g('FREQUENCY_TYPE_CODE')),
    frequency_formula: toStringOrNull(g('FREQUENCY_FORMULA')),
    effective_date: toIsoDateOrNull(g('EFFECTIVE_DATE')),
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

export async function listPayElementFrequencyRulesFromView(filters) {
  const { whereSql, binds, sortColumn, sortOrder } = buildPayElementFrequencyRuleListWhereClause(filters);
  const skipRows = (filters.page - 1) * filters.limit;

  const countSql = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} v ${whereSql}`;
  const dataSql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
  ${whereSql}
 ORDER BY v.${sortColumn} ${sortOrder} NULLS LAST,
          v.FREQUENCY_RULE_ID ASC
 OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const [countResult, dataResult] = await Promise.all([
      connection.execute(countSql, binds, ROW_OBJECT),
      connection.execute(dataSql, { ...binds, skip_rows: skipRows, fetch_next: filters.limit }, ROW_OBJECT)
    ]);
    return {
      rows: (dataResult.rows || []).map(mapPayElementFrequencyRuleViewRow),
      total: readScalarCount(countResult)
    };
  } catch (err) {
    logOracleError(err, 'listPayElementFrequencyRulesFromView');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementFrequencyRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

export async function getPayElementFrequencyRuleFromViewByGuid(frequencyRuleGuidHex) {
  const sql = `
SELECT ${VIEW_SELECT_COLUMNS}
  FROM ${VIEW} v
 WHERE UPPER(v.FREQUENCY_RULE_GUID) = :frequency_rule_guid`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(
      sql,
      { frequency_rule_guid: String(frequencyRuleGuidHex).trim().toUpperCase() },
      ROW_OBJECT
    );
    const row = result.rows?.[0];
    return row ? mapPayElementFrequencyRuleViewRow(row) : null;
  } catch (err) {
    logOracleError(err, 'getPayElementFrequencyRuleFromViewByGuid');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementFrequencyRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}

export async function existsFrequencyRuleForElement(elementId) {
  const sql = `
SELECT 1 AS FOUND
  FROM ${VIEW} v
 WHERE v.ELEMENT_ID = :element_id
 FETCH FIRST 1 ROWS ONLY`.trim();

  let connection;
  try {
    connection = await db.getConnection();
    const result = await connection.execute(sql, { element_id: elementId }, ROW_OBJECT);
    return Boolean(result.rows?.length);
  } catch (err) {
    logOracleError(err, 'existsFrequencyRuleForElement');
    throw new DatabaseError(GENERIC_ERROR_MESSAGE, err, resolvePayElementFrequencyRulesUserMessage(null, err));
  } finally {
    if (connection) {
      try {
        await connection.close();
      } catch (_) {}
    }
  }
}
