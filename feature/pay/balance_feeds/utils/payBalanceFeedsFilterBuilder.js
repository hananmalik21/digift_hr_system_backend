const VIEW = 'PAY.V_PAY_BALANCE_FEEDS';

export const LIST_WHERE_SQL = `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:status IS NULL OR STATUS = UPPER(:status))
  AND (:feed_type_code IS NULL OR FEED_TYPE_CODE = UPPER(:feed_type_code))
  AND (:element_id IS NULL OR ELEMENT_ID = :element_id)
  AND (:target_balance_id IS NULL OR TARGET_BALANCE_ID = :target_balance_id)
  AND (
        :as_of_date IS NULL
        OR TO_DATE(:as_of_date, 'YYYY-MM-DD') BETWEEN EFFECTIVE_START_DATE AND EFFECTIVE_END_DATE
      )
  AND (
        :search IS NULL
        OR UPPER(ELEMENT_NAME) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(ELEMENT_CODE) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(BALANCE_NAME) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(BALANCE_CODE) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(INPUT_FORMULA_DISPLAY) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(FEED_TYPE_CODE) LIKE '%' || UPPER(:search) || '%'
      )`;

export const COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_COUNT
FROM ${VIEW}
${LIST_WHERE_SQL}`;

export const LIST_SQL = `
SELECT *
FROM ${VIEW}
${LIST_WHERE_SQL}
ORDER BY BALANCE_FEED_ID DESC
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

export const GET_BY_GUID_SQL = `
SELECT *
FROM ${VIEW}
WHERE BALANCE_FEED_GUID = UPPER(REPLACE(:balance_feed_guid, '-', ''))`;

/**
 * @param {Record<string, unknown>} filters
 */
export function buildBalanceFeedListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    status: filters.status ?? null,
    feed_type_code: filters.feed_type_code ?? null,
    element_id: filters.element_id ?? null,
    target_balance_id: filters.target_balance_id ?? null,
    as_of_date: filters.as_of_date ?? null,
    search: filters.search ?? null
  };
}
