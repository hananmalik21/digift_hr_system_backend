import { executeQuery } from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { convertKeysToSnakeCase } from '../../../../utils/keyCase.js';
import { employeeAccessFunctionPredicate } from '../../../../utils/userContext.js';
import { parseOrgStructureListFromOracle } from '../utils/oracleCompensationRead.js';
import { paginateForExport } from '../../../../utils/excel/index.js';

function buildPlanFullDetailsSql(accessOptions) {
  const employeePredicate = employeeAccessFunctionPredicate(
    'v.ENTERPRISE_ID',
    'v.EMPLOYEE_ID',
    ':p_user_id',
    accessOptions
  );
  return `
  WITH filtered_keys AS (
    SELECT DISTINCT v.enterprise_id, v.employee_id, v.plan_id
      FROM COMP.V_EMPLOYEE_PLAN_FULL_DETAILS v
     WHERE v.ENTERPRISE_ID = :p_enterprise_id
       AND ${employeePredicate}
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
    NVL(v.TOTAL_RETRO_AMOUNT, 0) AS TOTAL_RETRO_AMOUNT,
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
    AND ${employeePredicate}
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
  delete next.TOTAL_COUNT;
  delete next.total_count;
  const orgParsed = await parseOrgStructureListFromOracle(orgSource);
  const snake = convertKeysToSnakeCase(next);
  const totalCompRaw = snake.total_compensation;
  const totalCompNum =
    totalCompRaw === null || totalCompRaw === undefined || totalCompRaw === ''
      ? totalCompRaw
      : Number(totalCompRaw);
  const totalRetroRaw = snake.total_retro_amount;
  const totalRetroNum =
    totalRetroRaw === null || totalRetroRaw === undefined || totalRetroRaw === ''
      ? totalRetroRaw
      : Number(totalRetroRaw);
  return {
    ...snake,
    ...(Number.isFinite(totalCompNum) ? { total_compensation: totalCompNum } : null),
    ...(Number.isFinite(totalRetroNum) ? { total_retro_amount: totalRetroNum } : null),
    org_structure_list: orgParsed
  };
}

/**
 * @param {{
 *   enterprise_id: number;
 *   user_id: number;
 *   employee_id?: number;
 *   plan_id?: number;
 *   employee_guid_hex?: string | null;
 *   plan_guid_hex?: string | null;
 * }} filters
 * @param {{ page: number, limit: number }} pagination
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number }>}
 */
export async function getEmployeePlanFullDetails(filters, pagination = { page: 1, limit: 25 }) {
  const { enterprise_id, user_id, employee_id, plan_id, employee_guid_hex, plan_guid_hex } = filters;
  const userIdNum = Number(user_id);
  if (!Number.isFinite(userIdNum) || userIdNum < 1) {
    throw new ValidationError('user_id is required and must be a positive number');
  }
  const page = Number(pagination?.page ?? 1);
  const limit = Number(pagination?.limit ?? 25);
  const offset = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, limit));
  const binds = {
    p_enterprise_id: enterprise_id,
    p_user_id: userIdNum,
    p_employee_id: employee_id ?? null,
    p_plan_id: plan_id ?? null,
    p_employee_guid_hex: employee_guid_hex ?? null,
    p_plan_guid_hex: plan_guid_hex ?? null,
    p_offset: offset,
    p_limit: Math.max(1, limit)
  };
  const accessOptions = filters.bypass_employee_access ? { bypass: true } : undefined;
  const result = await executeQuery(buildPlanFullDetailsSql(accessOptions), binds);
  const rawRows = result?.rows || [];
  const total =
    rawRows.length > 0
      ? Number(rawRows[0]?.TOTAL_COUNT ?? rawRows[0]?.total_count ?? 0)
      : 0;
  const rows = await Promise.all(rawRows.map((row) => mapRowWithParsedOrgStructure(row)));
  return { rows, total };
}

export async function getEmployeePlanFullDetailsForExport(filters, exportOptions = {}) {
  return paginateForExport({
    exportOptions,
    fetchPage: (page, pageSize) => getEmployeePlanFullDetails(filters, { page, limit: pageSize })
  });
}
