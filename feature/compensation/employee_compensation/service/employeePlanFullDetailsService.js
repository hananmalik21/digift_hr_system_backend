import { executeQuery } from '../../../../config/db.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';

/** Single source of truth: COMP.V_EMPLOYEE_PLAN_FULL_DETAILS (totals precomputed in the view). */
const PLAN_FULL_DETAILS_SQL = `
  SELECT
    ENTERPRISE_ID,
    EMPLOYEE_ID,
    EMPLOYEE_NUMBER,
    EMPLOYEE_NAME,
    ORG_STRUCTURE_LIST,
    POSITION_NAME,
    GRADE_NUMBER,
    GRADE_CATEGORY,
    PLAN_ID,
    PLAN_CODE,
    PLAN_NAME,
    STATUS_CODE,
    STRUCTURE_ID,
    STRUCTURE_CODE,
    STRUCTURE_NAME,
    TOTAL_BASE_SALARY,
    TOTAL_ALLOWANCE,
    TOTAL_BENEFITS
  FROM COMP.V_EMPLOYEE_PLAN_FULL_DETAILS
  WHERE ENTERPRISE_ID = :p_enterprise_id
    AND (:p_employee_id IS NULL OR EMPLOYEE_ID = :p_employee_id)
    AND (:p_plan_id IS NULL OR PLAN_ID = :p_plan_id)
  ORDER BY EMPLOYEE_ID, PLAN_ID
`;

/**
 * Oracle may return VARCHAR2, CLOB as string, or a Lob with getData() (Promise or callback).
 * @param {unknown} value
 * @returns {Promise<string|null>}
 */
async function oracleTextToString(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  if (typeof value === 'object' && typeof value.getData === 'function') {
    try {
      const pending = value.getData();
      if (pending != null && typeof pending.then === 'function') {
        const data = await pending;
        return data != null ? String(data) : null;
      }
      if (pending !== undefined) {
        return pending != null ? String(pending) : null;
      }
    } catch {
      /* try callback-style getData next */
    }
    try {
      const data = await new Promise((resolve, reject) => {
        value.getData((err, d) => (err ? reject(err) : resolve(d)));
      });
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(value);
}

/**
 * @param {string|null|undefined} text
 * @returns {unknown} Parsed JSON or original string on failure / non-JSON shape.
 */
function parseJsonLoose(text) {
  if (text == null) return null;
  const s = text.replace(/^\uFEFF/, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return null;
  if (!s.startsWith('[') && !s.startsWith('{')) return text;
  try {
    return JSON.parse(s);
  } catch {
    return text;
  }
}

/**
 * @param {unknown} value
 * @returns {Promise<unknown>}
 */
async function parseOrgStructureListColumn(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (
    typeof value === 'object' &&
    !Buffer.isBuffer(value) &&
    !(value instanceof Date) &&
    typeof value.getData !== 'function'
  ) {
    return value;
  }
  const text = await oracleTextToString(value);
  if (text == null) return null;
  return parseJsonLoose(text);
}

/**
 * Strip JSON column before `convertKeysToSnakeCase` so Lob-like values are not deep-copied as plain objects.
 * @param {Record<string, unknown>} row
 * @returns {Promise<Record<string, unknown>>}
 */
async function mapRowWithParsedOrgStructure(row) {
  const orgSource = row.ORG_STRUCTURE_LIST ?? row.org_structure_list;
  const next = { ...row };
  delete next.ORG_STRUCTURE_LIST;
  delete next.org_structure_list;
  const orgParsed = await parseOrgStructureListColumn(orgSource);
  const snake = convertKeysToSnakeCase(next);
  return { ...snake, org_structure_list: orgParsed };
}

/**
 * @param {{ enterprise_id: number, employee_id?: number, plan_id?: number }} filters
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function getEmployeePlanFullDetails(filters) {
  const { enterprise_id, employee_id, plan_id } = filters;
  const binds = {
    p_enterprise_id: enterprise_id,
    p_employee_id: employee_id ?? null,
    p_plan_id: plan_id ?? null
  };
  const result = await executeQuery(PLAN_FULL_DETAILS_SQL, binds);
  const rawRows = result?.rows || [];
  return Promise.all(rawRows.map((row) => mapRowWithParsedOrgStructure(row)));
}
