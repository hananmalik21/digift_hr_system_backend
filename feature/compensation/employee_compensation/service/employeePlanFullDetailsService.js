import { executeQuery } from '../../../../config/db.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';
import { parseOrgStructureListFromOracle } from '../utils/oracleCompensationRead.js';

/**
 * Plan full details list:
 * - row shape from COMP.V_EMPLOYEE_PLAN_FULL_DETAILS
 * - category totals from COMP.V_EMP_ASSIGNED_COMPONENTS_FULL (grouped by enterprise_id/employee_id/plan_id)
 *
 * This ensures ALLOWANCE totals never leak into TOTAL_BASE_SALARY.
 */
const PLAN_FULL_DETAILS_PAGED_SQL = `
  WITH totals AS (
    SELECT
      enterprise_id,
      employee_id,
      plan_id,
      SUM(NVL(total_base_salary, 0)) AS total_base_salary,
      SUM(NVL(total_allowance, 0))   AS total_allowance,
      SUM(NVL(total_benefits, 0))    AS total_benefits
    FROM COMP.V_EMP_ASSIGNED_COMPONENTS_FULL
    WHERE enterprise_id = :p_enterprise_id
      AND (:p_employee_id IS NULL OR employee_id = :p_employee_id)
      AND (:p_plan_id IS NULL OR plan_id = :p_plan_id)
    GROUP BY enterprise_id, employee_id, plan_id
  )
  SELECT
    v.ENTERPRISE_ID,
    v.EMPLOYEE_ID,
    v.EMPLOYEE_NUMBER,
    v.EMPLOYEE_NAME,
    v.ORG_STRUCTURE_LIST,
    v.POSITION_NAME,
    v.GRADE_NUMBER,
    v.GRADE_CATEGORY,
    v.PLAN_ID,
    v.PLAN_CODE,
    v.PLAN_NAME,
    v.STATUS_CODE,
    v.STRUCTURE_ID,
    v.STRUCTURE_CODE,
    v.STRUCTURE_NAME,
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
    AND (:p_employee_id IS NULL OR v.EMPLOYEE_ID = :p_employee_id)
    AND (:p_plan_id IS NULL OR v.PLAN_ID = :p_plan_id)
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
  return { ...snake, org_structure_list: orgParsed };
}

/**
 * @param {{ enterprise_id: number, employee_id?: number, plan_id?: number }} filters
 * @param {{ page: number, limit: number }} pagination
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number }>}
 */
export async function getEmployeePlanFullDetails(filters, pagination = { page: 1, limit: 25 }) {
  const { enterprise_id, employee_id, plan_id } = filters;
  const page = Number(pagination?.page ?? 1);
  const limit = Number(pagination?.limit ?? 25);
  const offset = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, limit));
  const binds = {
    p_enterprise_id: enterprise_id,
    p_employee_id: employee_id ?? null,
    p_plan_id: plan_id ?? null,
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
