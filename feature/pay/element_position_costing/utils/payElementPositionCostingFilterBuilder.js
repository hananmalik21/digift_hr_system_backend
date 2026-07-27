import { VIEW } from '../constants/payElementPositionCosting.constants.js';

export function buildListWhereClause() {
  return `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:element_id IS NULL OR ELEMENT_ID = :element_id)
  AND (:element_code IS NULL OR ELEMENT_CODE = :element_code)
  AND (:position_id IS NULL OR LOWER(REPLACE(POSITION_ID, '-', '')) = LOWER(REPLACE(:position_id, '-', '')))
  AND (:position_code IS NULL OR POSITION_CODE = :position_code)
  AND (:status_code IS NULL OR STATUS_CODE = :status_code)
  AND (
    :search IS NULL
    OR UPPER(NVL(ELEMENT_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(ELEMENT_NAME, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(POSITION_CODE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(POSITION_TITLE, '')) LIKE '%' || UPPER(:search) || '%'
    OR UPPER(NVL(COSTING_ACCOUNT, '')) LIKE '%' || UPPER(:search) || '%'
  )`;
}

export function buildListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    element_id: filters.element_id ?? null,
    element_code: filters.element_code ?? null,
    position_id: filters.position_id ?? null,
    position_code: filters.position_code ?? null,
    status_code: filters.status_code ?? null,
    search: filters.search ?? null
  };
}

export const COUNT_SQL = `SELECT COUNT(*) AS TOTAL_RECORDS FROM ${VIEW} ${buildListWhereClause()}`;

export const LIST_SQL = `
SELECT
  ELEM_POSITION_COSTING_ID,
  ELEM_POSITION_COSTING_GUID,
  ENTERPRISE_ID,
  ELEMENT_ID,
  ELEMENT_CODE,
  ELEMENT_NAME,
  POSITION_ID,
  POSITION_CODE,
  POSITION_TITLE,
  COSTING_ACCOUNT,
  FLEXFIELD_SEGMENTS_JSON,
  FLEXFIELD_SEGMENTS_DETAILS_JSON,
  EFFECTIVE_DATE,
  END_DATE,
  ALLOCATION_PERCENTAGE,
  STATUS_CODE
FROM ${VIEW}
${buildListWhereClause()}
ORDER BY ELEM_POSITION_COSTING_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
