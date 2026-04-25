import { executeQuery } from '../../../../config/db.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';
import { parseOrgStructureListFromOracle } from '../utils/oracleCompensationRead.js';

/**
 * Plan full details list:
 * - row shape from COMP.V_EMPLOYEE_PLAN_FULL_DETAILS
 * - category totals from COMP.V_EMP_ASSIGNED_COMPONENTS_FULL (grouped by enterprise_id/employee_id/plan_id)
 *
 * Filter: when `employee_guid_hex` / `plan_guid_hex` are non-null, those match RAW(16) on the view and
 * take precedence over numeric `employee_id` / `plan_id`. Totals use `filtered_keys` so GUID-only filters
 * stay correct without requiring GUID columns on V_EMP_ASSIGNED_COMPONENTS_FULL.
 *
 * This ensures ALLOWANCE totals never leak into TOTAL_BASE_SALARY.
 */
const PLAN_FULL_DETAILS_PAGED_SQL = `
  WITH filtered_keys AS (
    SELECT DISTINCT v.enterprise_id, v.employee_id, v.plan_id
      FROM COMP.V_EMPLOYEE_PLAN_FULL_DETAILS v
     WHERE v.ENTERPRISE_ID = :p_enterprise_id
       AND (
             (:p_employee_guid_hex IS NOT NULL AND v.EMPLOYEE_GUID = HEXTORAW(:p_employee_guid_hex))
          OR (:p_employee_guid_hex IS NULL AND (:p_employee_id IS NULL OR v.EMPLOYEE_ID = :p_employee_id))
       )
       AND (
             (:p_plan_guid_hex IS NOT NULL AND v.PLAN_GUID = HEXTORAW(:p_plan_guid_hex))
          OR (:p_plan_guid_hex IS NULL AND (:p_plan_id IS NULL OR v.PLAN_ID = :p_plan_id))
       )
  ),
  totals AS (
    SELECT
      a.enterprise_id,
      a.employee_id,
      a.plan_id,
      SUM(NVL(a.total_base_salary, 0)) AS total_base_salary,
      SUM(NVL(a.total_allowance, 0))   AS total_allowance,
      SUM(NVL(a.total_benefits, 0))    AS total_benefits
    FROM COMP.V_EMP_ASSIGNED_COMPONENTS_FULL a
    INNER JOIN filtered_keys fk
      ON fk.enterprise_id = a.enterprise_id
     AND fk.employee_id = a.employee_id
     AND fk.plan_id = a.plan_id
    GROUP BY a.enterprise_id, a.employee_id, a.plan_id
  )
  SELECT
    v.ENTERPRISE_ID,
    v.EMPLOYEE_ID,
    UPPER(RAWTOHEX(v.EMPLOYEE_GUID)) AS EMPLOYEE_GUID,
    v.EMPLOYEE_NUMBER,
    v.EMPLOYEE_NAME,
    v.ORG_STRUCTURE_LIST,
    v.POSITION_NAME,
    v.GRADE_NUMBER,
    v.GRADE_CATEGORY,
    v.PLAN_ID,
    UPPER(RAWTOHEX(v.PLAN_GUID)) AS PLAN_GUID,
    v.PLAN_CODE,
    v.PLAN_NAME,
    v.STATUS_CODE,
    v.STRUCTURE_ID,
    v.STRUCTURE_CODE,
    v.STRUCTURE_NAME,
    v.TOTAL_COMPENSATION,
    NVL(t.total_base_salary, 0) AS TOTAL_BASE_SALARY,
    NVL(t.total_allowance, 0)   AS TOTAL_ALLOWANCE,
    NVL(t.total_benefits, 0)    AS TOTAL_BENEFITS,
    COUNT(*) OVER () AS TOTAL_COUNT
  FROM COMP.V_EMPLOYEE_PLAN_FULL_DETAILS v
  LEFT JOIN totals t
    ON t.enterprise_id = v.enterprise_id
   AND t.employee_id = v.employee_id
   AND t.plan_id = v.plan_id
  WHERE v.ENTERPRISE_ID = :p_enterprise_id
    AND (
          (:p_employee_guid_hex IS NOT NULL AND v.EMPLOYEE_GUID = HEXTORAW(:p_employee_guid_hex))
       OR (:p_employee_guid_hex IS NULL AND (:p_employee_id IS NULL OR v.EMPLOYEE_ID = :p_employee_id))
    )
    AND (
          (:p_plan_guid_hex IS NOT NULL AND v.PLAN_GUID = HEXTORAW(:p_plan_guid_hex))
       OR (:p_plan_guid_hex IS NULL AND (:p_plan_id IS NULL OR v.PLAN_ID = :p_plan_id))
    )
  ORDER BY v.EMPLOYEE_ID, v.PLAN_ID
  OFFSET :p_offset ROWS FETCH NEXT :p_limit ROWS ONLY
`;

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
  delete next.TOTAL_COUNT;
  delete next.total_count;
  const orgParsed = await parseOrgStructureListFromOracle(orgSource);
  const snake = convertKeysToSnakeCase(next);
  const totalCompRaw = snake.total_compensation;
  const totalCompNum =
    totalCompRaw === null || totalCompRaw === undefined || totalCompRaw === ''
      ? totalCompRaw
      : Number(totalCompRaw);
  return {
    ...snake,
    ...(Number.isFinite(totalCompNum) ? { total_compensation: totalCompNum } : null),
    org_structure_list: orgParsed
  };
}

/**
 * @param {{
 *   enterprise_id: number;
 *   employee_id?: number;
 *   plan_id?: number;
 *   employee_guid_hex?: string | null;
 *   plan_guid_hex?: string | null;
 * }} filters
 * @param {{ page: number, limit: number }} pagination
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number }>}
 */
export async function getEmployeePlanFullDetails(filters, pagination = { page: 1, limit: 25 }) {
  const { enterprise_id, employee_id, plan_id, employee_guid_hex, plan_guid_hex } = filters;
  const page = Number(pagination?.page ?? 1);
  const limit = Number(pagination?.limit ?? 25);
  const offset = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, limit));
  const binds = {
    p_enterprise_id: enterprise_id,
    p_employee_id: employee_id ?? null,
    p_plan_id: plan_id ?? null,
    p_employee_guid_hex: employee_guid_hex ?? null,
    p_plan_guid_hex: plan_guid_hex ?? null,
    p_offset: offset,
    p_limit: Math.max(1, limit)
  };
  const result = await executeQuery(PLAN_FULL_DETAILS_PAGED_SQL, binds);
  const rawRows = result?.rows || [];
  const total =
    rawRows.length > 0
      ? Number(rawRows[0]?.TOTAL_COUNT ?? rawRows[0]?.total_count ?? 0)
      : 0;
  const rows = await Promise.all(rawRows.map((row) => mapRowWithParsedOrgStructure(row)));
  return { rows, total };
}
