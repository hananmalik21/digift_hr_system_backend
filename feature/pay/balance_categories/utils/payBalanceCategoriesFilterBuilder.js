const VIEW = 'PAY.V_PAY_BALANCE_CATEGORIES';

export const LIST_WHERE_SQL = `
WHERE (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)
  AND (:status_code IS NULL OR STATUS_CODE = UPPER(:status_code))
  AND (:category_type_code IS NULL OR CATEGORY_TYPE_CODE = UPPER(:category_type_code))
  AND (
        :search IS NULL
        OR UPPER(CATEGORY_CODE) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(CATEGORY_NAME) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(CATEGORY_DESCRIPTION) LIKE '%' || UPPER(:search) || '%'
      )`;

export const COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
FROM ${VIEW}
${LIST_WHERE_SQL}`;

export const LIST_SQL = `
SELECT *
FROM ${VIEW}
${LIST_WHERE_SQL}
ORDER BY CATEGORY_TYPE_CODE, CATEGORY_NAME
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

export const GET_BY_GUID_SQL = `
SELECT *
FROM ${VIEW}
WHERE LOWER(REPLACE(BALANCE_CATEGORY_GUID, '-', '')) = LOWER(REPLACE(:balance_category_guid, '-', ''))
  AND (ENTERPRISE_ID = :enterprise_id OR ENTERPRISE_ID IS NULL)`;

/**
 * @param {Record<string, unknown>} filters
 */
export function buildBalanceCategoryListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    status_code: filters.status_code ?? null,
    category_type_code: filters.category_type_code ?? null,
    search: filters.search ?? null
  };
}
