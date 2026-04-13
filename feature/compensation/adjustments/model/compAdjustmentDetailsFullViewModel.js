/**
 * Read-only list from COMP.COMP_ADJUSTMENT_DETAILS_FULL_V.
 * Dynamic WHERE with named bind variables; OFFSET/FETCH pagination; ORDER BY ADJUSTMENT_ID DESC.
 */

import oracledb from 'oracledb';
import { withCompSchemaConnection } from '../../db/withCompSchemaConnection.js';
import { readScalarCount } from '../../salary_structures/utils/oracleListHelpers.js';
import { DatabaseError } from '../../../../utils/errors/index.js';
import { AdjustmentListValidationError } from '../utils/adjustmentListErrors.js';
import { strOrNull, firstStrOrNull } from '../utils/adjustmentRowMappers.js';

const VIEW = 'COMP.COMP_ADJUSTMENT_DETAILS_FULL_V';
const LOG_TAG = 'compAdjustmentDetailsFullViewModel';

const ROW_OBJECT = { outFormat: oracledb.OUT_FORMAT_OBJECT };

/** Possible view column names for JSON array payloads (first hit wins). */
const ASSIGNMENT_JSON_KEYS = Object.freeze([
  'ASSIGNMENT_DETAILS_JSON',
  'ASSIGNMENT_DETAIL_JSON',
  'ASSIGNMENT_DETAILS_CLOB',
  'ASSIGNMENT_DETAILS'
]);
const FILE_URL_KEYS = Object.freeze([
  'FILE_URLS',
  'FILE_URLS_JSON',
  'ADJUSTMENT_FILE_URLS',
  'DOCUMENT_URLS_JSON'
]);
const ORG_STRUCTURE_KEYS = Object.freeze(['ORG_STRUCTURE_LIST', 'ORG_STRUCTURE_LIST_JSON']);

/** Allow TENANT_ID if the view uses that column instead of ENTERPRISE_ID. */
function enterpriseColumn() {
  const c = (process.env.COMP_ADJUSTMENT_DETAILS_ENTERPRISE_COL || 'ENTERPRISE_ID')
    .trim()
    .toUpperCase();
  return c === 'TENANT_ID' ? 'TENANT_ID' : 'ENTERPRISE_ID';
}

/** Safe ORDER BY column (override via env if the view uses a different sort key). */
function orderByColumn() {
  const raw = (process.env.COMP_ADJUSTMENT_DETAILS_ORDER_BY_COL || 'ADJUSTMENT_ID').trim().toUpperCase();
  return /^[A-Z0-9_]+$/.test(raw) ? raw : 'ADJUSTMENT_ID';
}

/** BLOB / LOB columns must not be returned; close LOBs to avoid resource leaks. */
function isLikelyLob(val) {
  if (val == null || typeof val !== 'object') return false;
  return typeof val.close === 'function' && typeof val.getData === 'function';
}

function dropLobValues(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (isLikelyLob(v)) {
      try {
        v.close();
      } catch (_) {}
      continue;
    }
    out[k] = v;
  }
  return out;
}

function firstRawByKeys(g, keys) {
  for (const k of keys) {
    const v = g(k);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function wrapDbError(err, context) {
  console.error(`[${LOG_TAG}] ${context}`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', err?.message || err);
  return new DatabaseError(err?.message || 'Database error', err, null);
}

function rowKeysUpper(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[String(k).toUpperCase()] = v;
  }
  return out;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toIsoDateOrNull(v) {
  if (v == null) return null;
  if (v instanceof Date && Number.isFinite(v.getTime())) return v.toISOString();
  return null;
}

function guidHex(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
  const s = String(v).trim();
  return s || null;
}

function computeSalaryDifferencePercent(totalSalary, previousSalary) {
  const prev = toNumberOrNull(previousSalary);
  const total = toNumberOrNull(totalSalary);
  if (prev == null || total == null || prev === 0) return null;
  return ((total - prev) / prev) * 100;
}

/**
 * @param {unknown} raw
 * @param {'assignment_details_json'|'file_urls'|'org_structure_list'} field
 * @returns {unknown[]}
 */
function parseJsonArrayField(raw, field) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (s === '') return [];
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) {
      throw new AdjustmentListValidationError(`${field} must be a JSON array`);
    }
    return parsed;
  } catch (e) {
    if (e instanceof AdjustmentListValidationError) throw e;
    const msg = e instanceof SyntaxError ? `${field} is not valid JSON` : e.message;
    throw new AdjustmentListValidationError(msg);
  }
}

/**
 * @param {object} filters
 * @param {string} entCol
 * @returns {{ whereSql: string, binds: Record<string, unknown> }}
 */
function buildWhereClause(filters, entCol) {
  const whereParts = [`v.${entCol} = :enterprise_id`];
  const binds = { enterprise_id: filters.enterprise_id };

  if (filters.adjustment_id != null) {
    whereParts.push('v.ADJUSTMENT_ID = :adjustment_id');
    binds.adjustment_id = filters.adjustment_id;
  }
  if (filters.employee_id != null) {
    whereParts.push('v.EMPLOYEE_ID = :employee_id');
    binds.employee_id = filters.employee_id;
  }
  if (filters.plan_id != null) {
    whereParts.push('v.PLAN_ID = :plan_id');
    binds.plan_id = filters.plan_id;
  }
  if (filters.status != null) {
    whereParts.push('v.STATUS = :status');
    binds.status = filters.status;
  }

  const whereSql = `WHERE ${whereParts.join(' AND ')}`;
  return { whereSql, binds };
}

export function mapAdjustmentFullViewRow(row) {
  if (!row) return null;
  const r = rowKeysUpper(row);
  const g = (k) => r[k];

  const assignment_details_json = parseJsonArrayField(
    firstRawByKeys(g, ASSIGNMENT_JSON_KEYS),
    'assignment_details_json'
  );
  const file_urls = parseJsonArrayField(firstRawByKeys(g, FILE_URL_KEYS), 'file_urls');
  const org_structure_list = parseJsonArrayField(firstRawByKeys(g, ORG_STRUCTURE_KEYS), 'org_structure_list');

  const total_salary = toNumberOrNull(g('TOTAL_SALARY'));
  const previous_salary = toNumberOrNull(g('PREVIOUS_SALARY'));

  return {
    adjustment_id: toNumberOrNull(g('ADJUSTMENT_ID')),
    adjustment_guid: guidHex(g('ADJUSTMENT_GUID')),
    enterprise_id: toNumberOrNull(g('ENTERPRISE_ID') ?? g('TENANT_ID')),
    employee_id: toNumberOrNull(g('EMPLOYEE_ID')),
    plan_id: toNumberOrNull(g('PLAN_ID')),
    component_id: toNumberOrNull(g('COMPONENT_ID')),
    adjustment_type: strOrNull(r, 'ADJUSTMENT_TYPE'),
    effective_date: toIsoDateOrNull(g('EFFECTIVE_DATE')),
    reason_code: strOrNull(r, 'REASON_CODE'),
    budget_code: strOrNull(r, 'BUDGET_CODE'),
    justification_text: strOrNull(r, 'JUSTIFICATION_TEXT'),
    performance_rating: strOrNull(r, 'PERFORMANCE_RATING'),
    internal_notes: strOrNull(r, 'INTERNAL_NOTES'),
    status: strOrNull(r, 'STATUS'),
    active_flag: strOrNull(r, 'ACTIVE_FLAG'),
    created_by: strOrNull(r, 'CREATED_BY'),
    creation_date: toIsoDateOrNull(g('CREATION_DATE')),
    last_updated_by: firstStrOrNull(g, ['LAST_UPDATED_BY', 'LAST_UPDATE_BY']),
    last_update_date: toIsoDateOrNull(g('LAST_UPDATE_DATE')),
    employee_guid: guidHex(g('EMPLOYEE_GUID')),
    employee_name: strOrNull(r, 'EMPLOYEE_NAME'),
    first_name_en: strOrNull(r, 'FIRST_NAME_EN'),
    middle_name_en: strOrNull(r, 'MIDDLE_NAME_EN'),
    last_name_en: strOrNull(r, 'LAST_NAME_EN'),
    first_name_ar: strOrNull(r, 'FIRST_NAME_AR'),
    middle_name_ar: strOrNull(r, 'MIDDLE_NAME_AR'),
    last_name_ar: strOrNull(r, 'LAST_NAME_AR'),
    family_name_ar: strOrNull(r, 'FAMILY_NAME_AR'),
    employee_number: strOrNull(r, 'EMPLOYEE_NUMBER'),
    org_structure_list,
    total_salary,
    previous_salary,
    salary_difference_percent: computeSalaryDifferencePercent(total_salary, previous_salary),
    assignment_details_json,
    file_urls
  };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   adjustment_id?: number,
 *   employee_id?: number,
 *   plan_id?: number,
 *   status?: string,
 *   page: number,
 *   limit: number
 * }} filters
 * @returns {Promise<{ rows: object[], total: number }>}
 */
export async function listAdjustmentDetailsFullViewPaged(filters) {
  const entCol = enterpriseColumn();
  const orderCol = orderByColumn();
  const { whereSql, binds } = buildWhereClause(filters, entCol);

  const countSql = `SELECT COUNT(*) AS CNT FROM ${VIEW} v ${whereSql}`;

  /** COUNT must not receive pagination binds — Oracle ORA-01036 on unused bind names. */
  const filterBinds = { ...binds };
  const skipRows = (filters.page - 1) * filters.limit;
  const dataBinds = {
    ...filterBinds,
    skip_rows: skipRows,
    fetch_next: filters.limit
  };

  const dataSql = `
SELECT v.*
FROM ${VIEW} v
${whereSql}
ORDER BY v.${orderCol} DESC
OFFSET :skip_rows ROWS FETCH NEXT :fetch_next ROWS ONLY
`.trim();

  return withCompSchemaConnection(async (conn) => {
    try {
      const countResult = await conn.execute(countSql, filterBinds, ROW_OBJECT);
      const total = readScalarCount(countResult);

      const dataResult = await conn.execute(dataSql, dataBinds, ROW_OBJECT);
      const rawRows = dataResult.rows || [];

      return {
        rows: rawRows.map((row) => mapAdjustmentFullViewRow(dropLobValues(row))),
        total
      };
    } catch (err) {
      if (err instanceof AdjustmentListValidationError) throw err;
      throw wrapDbError(err, 'listAdjustmentDetailsFullViewPaged');
    }
  });
}
