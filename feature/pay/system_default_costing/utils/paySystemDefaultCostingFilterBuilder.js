import { VIEW } from '../constants/paySystemDefaultCosting.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)
  AND (
    :effective_as_of IS NULL
    OR (
      EFFECTIVE_DATE <= TO_DATE(:effective_as_of, 'YYYY-MM-DD')
      AND (END_DATE IS NULL OR END_DATE >= TO_DATE(:effective_as_of, 'YYYY-MM-DD'))
    )
  )
  AND (
    :effective_start_date IS NULL
    OR EFFECTIVE_DATE >= TO_DATE(:effective_start_date, 'YYYY-MM-DD')
  )
  AND (
    :effective_end_date IS NULL
    OR END_DATE <= TO_DATE(:effective_end_date, 'YYYY-MM-DD')
  )`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    status_code: filters.status_code ?? null,
    effective_as_of: filters.effective_as_of ?? null,
    effective_start_date: filters.effective_start_date ?? null,
    effective_end_date: filters.effective_end_date ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  SYSTEM_DEFAULT_COSTING_ID,
  SYSTEM_DEFAULT_COSTING_GUID,
  ENTERPRISE_ID,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY SYSTEM_DEFAULT_COSTING_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
