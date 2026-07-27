import { VIEW } from '../constants/payElementDepartmentCosting.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:element_id IS NULL OR ELEMENT_ID = :element_id)
  AND (:element_code IS NULL OR ELEMENT_CODE = :element_code)
  AND (:department_id IS NULL OR LOWER(REPLACE(DEPARTMENT_ID, '-', '')) = LOWER(REPLACE(:department_id, '-', '')))
  AND (:department_code IS NULL OR DEPARTMENT_CODE = :department_code)
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)
  AND (
    :search IS NULL
    OR UPPER(NVL(ELEMENT_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(ELEMENT_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(DEPARTMENT_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(DEPARTMENT_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(COSTING_ACCOUNT, '')) LIKE '%' || UPPER(:search) || '%'
  )`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    element_id: filters.element_id ?? null,
    element_code: filters.element_code ?? null,
    department_id: filters.department_id ?? null,
    department_code: filters.department_code ?? null,
    status_code: filters.status_code ?? null,
    search: filters.search ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  ELEM_DEPT_COSTING_ID,
  ELEM_DEPT_COSTING_GUID,
  ENTERPRISE_ID,
  ELEMENT_ID,
  ELEMENT_CODE,
  ELEMENT_NAME,
  DEPARTMENT_ID,
  DEPARTMENT_CODE,
  DEPARTMENT_NAME,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY ELEM_DEPT_COSTING_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
