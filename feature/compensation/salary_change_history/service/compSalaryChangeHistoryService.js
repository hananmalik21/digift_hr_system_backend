import { executeQuery } from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { employeeAccessFunctionPredicate } from '../../../../utils/userContext.js';
import {
  formatOracleDateToIsoDay,
  oracleTextToString,
  oracleRawToHexOrValue,
  parseOrgStructureListFromOracle
} from '../../employee_compensation/utils/oracleCompensationRead.js';

function formatOracleDateTimeToIsoSeconds(value) {
  if (value == null) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Match sample shape "YYYY-MM-DDTHH:mm:ss" (UTC, no Z)
    return value.toISOString().slice(0, 19);
  }
  const s = String(value).trim();
  if (s === '') return null;
  // If already ISO-like, keep first 19 chars.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  return s;
}

function safeJsonArray(value) {
  if (Array.isArray(value)) return value;
  return [];
}

async function parseComponentsJsonToArray(componentsJson) {
  const text = await oracleTextToString(componentsJson);
  if (text == null) return [];
  const s = String(text).replace(/^\uFEFF/, '').trim();
  if (s === '' || s.toLowerCase() === 'null') return [];
  try {
    const parsed = JSON.parse(s);
    return safeJsonArray(parsed);
  } catch {
    return [];
  }
}

async function mapViewRowToSalaryChangeHistoryRow(r) {
  const org = await parseOrgStructureListFromOracle(r.ORG_STRUCTURE_LIST);
  const components = await parseComponentsJsonToArray(r.COMPONENTS_JSON);
  return {
    enterprise_id: r.ENTERPRISE_ID,
    employee_id: r.EMPLOYEE_ID,
    employee_guid: oracleRawToHexOrValue(r.EMPLOYEE_GUID),
    employee_name_en: r.EMPLOYEE_NAME_EN,
    employee_number: r.EMPLOYEE_NUMBER,
    position_name: r.POSITION_NAME,
    grade_name: r.GRADE_NAME,
    org_structure_list: Array.isArray(org) ? org : [],
    adjustment_id: r.ADJUSTMENT_ID,
    adjustment_type: r.ADJUSTMENT_TYPE,
    reason_code: r.REASON_CODE,
    submission_date: formatOracleDateTimeToIsoSeconds(r.SUBMISSION_DATE),
    change_source: r.CHANGE_SOURCE,
    currency_code: r.CURRENCY_CODE,
    change_effective_date: formatOracleDateToIsoDay(r.CHANGE_EFFECTIVE_DATE),
    change_created_date: formatOracleDateTimeToIsoSeconds(r.CHANGE_CREATED_DATE),
    previous_salary: r.PREVIOUS_SALARY,
    current_salary: r.CURRENT_SALARY,
    impact_amount: r.IMPACT_AMOUNT,
    impact_percent: r.IMPACT_PERCENT,
    total_earnings: r.TOTAL_EARNINGS,
    total_allowances: r.TOTAL_ALLOWANCES,
    total_benefits: r.TOTAL_BENEFITS,
    total_bonuses: r.TOTAL_BONUSES,
    total_deductions: r.TOTAL_DEDUCTIONS,
    change_type: r.CHANGE_TYPE,
    status: r.STATUS,
    component_count: r.COMPONENT_COUNT,
    components
  };
}

function buildBindsFromParams(params) {
  const enterpriseId = params.enterprise_id;
  const userIdNum = Number(params.user_id);
  if (!Number.isFinite(userIdNum) || userIdNum < 1) {
    throw new ValidationError('user_id is required and must be a positive number');
  }
  const employeeId = params.employee_id ?? null;
  const employeeGuidHex = params.employee_guid ?? null;
  const orgUnitIdHex = params.org_unit_id_hex ?? null;
  const levelCode = params.level_code ?? null;
  const searchRaw = params.search ?? null;
  const searchLike = searchRaw ? `%${String(searchRaw).toUpperCase()}%` : null;
  const status = params.status ?? null;
  const changeType = params.change_type ?? null;
  const reasonCode = params.reason_code ?? null;
  const fromDate = params.from_date ?? null;
  const toDate = params.to_date ?? null;
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  return {
    enterprise_id: enterpriseId,
    user_id: userIdNum,
    employee_id: employeeId,
    employee_guid: employeeGuidHex,
    org_unit_id_hex: orgUnitIdHex,
    level_code: levelCode,
    search_like: searchLike,
    status,
    change_type: changeType,
    reason_code: reasonCode,
    from_date: fromDate,
    to_date: toDate,
    limit,
    offset
  };
}

function buildBaseWhere(accessOptions) {
  const employeePredicate = employeeAccessFunctionPredicate(
    'enterprise_id',
    'employee_id',
    ':user_id',
    accessOptions
  );
  return `
WHERE enterprise_id = :enterprise_id
  AND ${employeePredicate}
  AND (:employee_id IS NULL OR employee_id = :employee_id)
  AND (:employee_guid IS NULL OR employee_guid = HEXTORAW(:employee_guid))
  AND (
    :org_unit_id_hex IS NULL
    OR (
      :level_code IS NULL
      AND JSON_EXISTS(org_structure_list, '$[*]?(@.org_unit_id == $oid)' PASSING :org_unit_id_hex AS "oid")
    )
    OR (
      :level_code IS NOT NULL
      AND JSON_EXISTS(
        org_structure_list,
        '$[*]?(@.level_code == $lvl && @.org_unit_id == $oid)'
        PASSING :org_unit_id_hex AS "oid", :level_code AS "lvl"
      )
    )
  )
  AND (
    :search_like IS NULL
    OR UPPER(employee_name_en) LIKE :search_like
    OR UPPER(employee_number) LIKE :search_like
  )
  AND (:status IS NULL OR status = :status)
  AND (:change_type IS NULL OR change_type = :change_type)
  AND (:reason_code IS NULL OR UPPER(reason_code) = :reason_code)
  AND (
    :from_date IS NULL
    OR :to_date IS NULL
    OR change_effective_date BETWEEN TO_DATE(:from_date, 'YYYY-MM-DD') AND TO_DATE(:to_date, 'YYYY-MM-DD')
  )
`;
}

/**
 * Oldest → latest (ascending only). NULLS FIRST on change_created_date so Initial Load rows with a null
 * creation timestamp still sort before later rows sharing the same effective date.
 */
const ORDER_BY_LIST = `ORDER BY change_effective_date ASC, change_created_date ASC NULLS FIRST`;

function buildListSql(accessOptions) {
  return `
SELECT
  enterprise_id,
  employee_id,
  employee_guid,
  employee_name_en,
  employee_number,
  position_name,
  grade_name,
  org_structure_list,
  adjustment_id,
  adjustment_type,
  reason_code,
  submission_date,
  change_source,
  currency_code,
  change_effective_date,
  change_created_date,
  previous_salary,
  current_salary,
  impact_amount,
  impact_percent,
  total_earnings,
  total_allowances,
  total_benefits,
  total_bonuses,
  total_deductions,
  change_type,
  status,
  component_count,
  components_json
FROM COMP.COMP_SALARY_CHANGE_HISTORY_V
${buildBaseWhere(accessOptions)}
${ORDER_BY_LIST}
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
`;
}

function buildCountSql(accessOptions) {
  return `
SELECT COUNT(*) AS total_count
FROM COMP.COMP_SALARY_CHANGE_HISTORY_V
${buildBaseWhere(accessOptions)}
`;
}

export async function fetchSalaryChangeHistory(params) {
  const accessOptions = params.bypass_employee_access ? { bypass: true } : undefined;
  const sqlList = buildListSql(accessOptions);
  const sqlCount = buildCountSql(accessOptions);
  const binds = buildBindsFromParams(params);
  // Oracle throws ORA-01036 if we pass binds not present in the SQL text.
  // COUNT does not include pagination binds. user_id is included in both
  // (BASE_WHERE references it via FNDSEC.CAN_ACCESS_EMPLOYEE).
  const { limit, offset, ...filterBinds } = binds;
  const listBinds = { ...filterBinds, limit, offset };

  const [countResult, listResult] = await Promise.all([
    executeQuery(sqlCount, filterBinds),
    executeQuery(sqlList, listBinds)
  ]);

  const total = Number(countResult?.rows?.[0]?.TOTAL_COUNT ?? 0) || 0;

  const rows = listResult?.rows || [];
  const data = await Promise.all(rows.map((r) => mapViewRowToSalaryChangeHistoryRow(r)));

  return {
    total,
    rows: data
  };
}

export const __test__ = {
  buildBindsFromParams
};
