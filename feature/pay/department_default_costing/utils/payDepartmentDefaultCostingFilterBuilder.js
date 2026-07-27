import { VIEW } from '../constants/payDepartmentDefaultCosting.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:department_id IS NULL OR LOWER(REPLACE(DEPARTMENT_ID, '-', '')) = LOWER(REPLACE(:department_id, '-', '')))
  AND (:department_code IS NULL OR DEPARTMENT_CODE = :department_code)
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)
  AND (
    :search IS NULL
    OR UPPER(NVL(DEPARTMENT_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(DEPARTMENT_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(COSTING_ACCOUNT, '')) LIKE '%' || UPPER(:search) || '%'
  )`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    department_id: filters.department_id ?? null,
    department_code: filters.department_code ?? null,
    status_code: filters.status_code ?? null,
    search: filters.search ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  DEPT_DEFAULT_COSTING_ID,
  DEPT_DEFAULT_COSTING_GUID,
  ENTERPRISE_ID,
  DEPARTMENT_ID,
  DEPARTMENT_CODE,
  DEPARTMENT_NAME,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  ALLOCATION_PERCENTAGE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY DEPT_DEFAULT_COSTING_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
