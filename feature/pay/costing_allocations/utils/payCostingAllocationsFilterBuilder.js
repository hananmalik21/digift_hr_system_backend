import { VIEW } from '../constants/payCostingAllocations.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:employee_id IS NULL OR EMPLOYEE_ID = :employee_id)
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    employee_id: filters.employee_id ?? null,
    status_code: filters.status_code ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  COSTING_ALLOCATION_ID,
  COSTING_ALLOCATION_GUID,
  ENTERPRISE_ID,
  EMPLOYEE_ID,
  EMPLOYEE_GUID,
  EMPLOYEE_NAME,
  ASSIGNMENT_ID,
  ASSIGNMENT_NUMBER,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  ALLOCATION_PERCENTAGE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY COSTING_ALLOCATION_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

