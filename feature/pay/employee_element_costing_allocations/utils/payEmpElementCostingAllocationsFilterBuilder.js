import { VIEW } from '../constants/payEmpElementCostingAllocations.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:employee_id IS NULL OR EMPLOYEE_ID = :employee_id)
  AND (:element_id IS NULL OR ELEMENT_ID = :element_id)
  AND (:element_code IS NULL OR ELEMENT_CODE = :element_code)
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)
  AND (
    :search IS NULL
    OR UPPER(NVL(EMPLOYEE_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(ELEMENT_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(ELEMENT_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(COSTING_ACCOUNT, '')) LIKE '%' || UPPER(:search) || '%'
  )`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    employee_id: filters.employee_id ?? null,
    element_id: filters.element_id ?? null,
    element_code: filters.element_code ?? null,
    status_code: filters.status_code ?? null,
    search: filters.search ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  EMP_ELEMENT_COSTING_ID,
  EMP_ELEMENT_COSTING_GUID,
  ENTERPRISE_ID,
  EMPLOYEE_ID,
  EMPLOYEE_NAME,
  ELEMENT_ID,
  ELEMENT_CODE,
  ELEMENT_NAME,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  ALLOCATION_PERCENTAGE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY EMP_ELEMENT_COSTING_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
