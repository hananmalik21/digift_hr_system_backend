import { executeQuery } from '../../../../config/db.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';
import {
  oracleTextToString,
  oracleRawToHexOrValue,
  formatOracleDateToIsoDay,
  parseJsonLoose
} from '../utils/oracleCompensationRead.js';

const PLAN_ACTIVE_COLUMNS = `
    ENTERPRISE_ID,
    EMPLOYEE_ID,
    EMPLOYEE_GUID,
    EMPLOYEE_NUMBER,
    EMPLOYEE_NAME,
    CONTRACT_TYPE_CODE,
    ENTERPRISE_HIRE_DATE,
    ORG_STRUCTURE_LIST,
    POSITION_ID,
    POSITION_NAME,
    GRADE_ID,
    GRADE_NUMBER,
    GRADE_CATEGORY,
    PLAN_TYPE_CODE,
    PLAN_ID,
    PLAN_GUID,
    PLAN_CODE,
    PLAN_NAME,
    STRUCTURE_ID,
    STRUCTURE_GUID,
    STRUCTURE_CODE,
    STRUCTURE_NAME,
    STRUCTURE_CURRENCY_CODE,
    STRUCTURE_EFFECTIVE_FROM,
    STRUCTURE_EFFECTIVE_TO,
    COMPONENTS_JSON
`;

const PLAN_ACTIVE_BY_ID_SQL = `
  SELECT ${PLAN_ACTIVE_COLUMNS}
  FROM COMP.V_EMP_PLAN_ACTIVE_COMPONENTS_JSON
  WHERE ENTERPRISE_ID = :enterprise_id
    AND EMPLOYEE_ID = :employee_id
    AND PLAN_ID = :plan_id
`;

const PLAN_ACTIVE_BY_GUID_SQL = `
  SELECT ${PLAN_ACTIVE_COLUMNS}
  FROM COMP.V_EMP_PLAN_ACTIVE_COMPONENTS_JSON
  WHERE EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)
    AND PLAN_GUID = HEXTORAW(:plan_guid_hex)
`;

const PLAN_ACTIVE_BY_ENTERPRISE_AND_GUID_SQL = `
  SELECT ${PLAN_ACTIVE_COLUMNS}
  FROM COMP.V_EMP_PLAN_ACTIVE_COMPONENTS_JSON
  WHERE ENTERPRISE_ID = :enterprise_id
    AND EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)
    AND PLAN_GUID = HEXTORAW(:plan_guid_hex)
`;

/** RAW columns returned as 32-char hex in JSON responses. */
const RAW_HEX_RESPONSE_KEYS = [
  'employee_guid',
  'plan_guid',
  'position_id',
  'grade_id',
  'structure_guid'
];

/**
 * @param {unknown} value
 * @returns {Promise<unknown>}
 */
async function parseComponentsJsonColumn(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === 'object' && typeof value.getData === 'function') {
    const text = await oracleTextToString(value);
    if (text == null || String(text).trim() === '') return null;
    try {
      return JSON.parse(String(text).replace(/^\uFEFF/, '').trim());
    } catch {
      return text;
    }
  }
  if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    return value;
  }
  const text = await oracleTextToString(value);
  if (text == null || String(text).trim() === '') return null;
  const s = String(text).replace(/^\uFEFF/, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * @param {unknown} parsed
 * @returns {unknown[]|null|string|unknown}
 */
function normalizeComponentsJson(parsed) {
  if (parsed == null) return null;
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === 'object') return [parsed];
  return parsed;
}

/**
 * Org list: plain path string, JSON array, or single JSON object (wrapped to array).
 * @param {unknown} orgVal
 * @returns {unknown}
 */
function parseOrgStructureListColumn(orgVal) {
  if (orgVal == null || orgVal === '') return null;
  if (Array.isArray(orgVal)) return orgVal;
  const s = String(orgVal).replace(/^\uFEFF/, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  if (!s.startsWith('[') && !s.startsWith('{')) return s;
  const parsed = parseJsonLoose(s);
  if (Array.isArray(parsed)) return parsed;
  if (parsed != null && typeof parsed === 'object') return [parsed];
  return parsed;
}

/**
 * @param {Record<string, unknown>} snake
 * @returns {Record<string, unknown>}
 */
function applyRawHexFields(snake) {
  const out = { ...snake };
  for (const key of RAW_HEX_RESPONSE_KEYS) {
    out[key] = oracleRawToHexOrValue(snake[key]);
  }
  return out;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Promise<Record<string, unknown>|null>}
 */
async function mapRow(row) {
  if (!row || typeof row !== 'object') return null;
  const orgSource = row.ORG_STRUCTURE_LIST ?? row.org_structure_list;
  const componentsSource = row.COMPONENTS_JSON ?? row.components_json;
  const next = { ...row };
  delete next.ORG_STRUCTURE_LIST;
  delete next.org_structure_list;
  delete next.COMPONENTS_JSON;
  delete next.components_json;

  let orgVal = orgSource;
  if (orgSource != null && typeof orgSource === 'object' && typeof orgSource.getData === 'function') {
    orgVal = await oracleTextToString(orgSource);
  } else if (Buffer.isBuffer(orgSource)) {
    orgVal = orgSource.toString('utf8');
  }

  const componentsParsed = normalizeComponentsJson(await parseComponentsJsonColumn(componentsSource));
  const snake = convertKeysToSnakeCase(next);
  const withHex = applyRawHexFields(snake);
  return {
    ...withHex,
    org_structure_list: parseOrgStructureListColumn(orgVal),
    enterprise_hire_date: formatOracleDateToIsoDay(snake.enterprise_hire_date),
    structure_effective_from: formatOracleDateToIsoDay(snake.structure_effective_from),
    structure_effective_to: formatOracleDateToIsoDay(snake.structure_effective_to),
    components_json: componentsParsed
  };
}

/**
 * @param {{
 *   mode: 'id';
 *   enterprise_id: number;
 *   employee_id: number;
 *   plan_id: number;
 * } | {
 *   mode: 'guid';
 *   employee_guid_hex: string;
 *   plan_guid_hex: string;
 *   enterprise_id: number | null;
 * }} filters
 * @returns {{ sql: string, binds: Record<string, unknown> }}
 */
function planDetailsSqlAndBinds(filters) {
  if (filters.mode === 'guid') {
    if (filters.enterprise_id != null) {
      return {
        sql: PLAN_ACTIVE_BY_ENTERPRISE_AND_GUID_SQL,
        binds: {
          enterprise_id: filters.enterprise_id,
          employee_guid_hex: filters.employee_guid_hex,
          plan_guid_hex: filters.plan_guid_hex
        }
      };
    }
    return {
      sql: PLAN_ACTIVE_BY_GUID_SQL,
      binds: {
        employee_guid_hex: filters.employee_guid_hex,
        plan_guid_hex: filters.plan_guid_hex
      }
    };
  }
  return {
    sql: PLAN_ACTIVE_BY_ID_SQL,
    binds: {
      enterprise_id: filters.enterprise_id,
      employee_id: filters.employee_id,
      plan_id: filters.plan_id
    }
  };
}

/**
 * @param {{
 *   mode: 'id';
 *   enterprise_id: number;
 *   employee_id: number;
 *   plan_id: number;
 * } | {
 *   mode: 'guid';
 *   employee_guid_hex: string;
 *   plan_guid_hex: string;
 *   enterprise_id: number | null;
 * }} filters
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getEmployeeCompensationPlanDetails(filters) {
  const { sql, binds } = planDetailsSqlAndBinds(filters);
  const result = await executeQuery(sql, binds);
  const rawRows = result?.rows || [];
  if (rawRows.length === 0) return null;
  return mapRow(rawRows[0]);
}
