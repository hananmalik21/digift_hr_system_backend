const VIEW = 'PAY.V_PAY_BALANCE_DEFINITIONS';

export const LIST_WHERE_SQL = `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:balance_category_id IS NULL OR BALANCE_CATEGORY_ID = :balance_category_id)
  AND (:category_code IS NULL OR CATEGORY_CODE = UPPER(:category_code))
  AND (:unit_of_measure_code IS NULL OR UNIT_OF_MEASURE_CODE = UPPER(:unit_of_measure_code))
  AND (:balance_type_code IS NULL OR BALANCE_TYPE_CODE = UPPER(:balance_type_code))
  AND (:currency_code IS NULL OR CURRENCY_CODE = UPPER(:currency_code))
  AND (:active_flag IS NULL OR ACTIVE_FLAG = UPPER(:active_flag))
  AND (:currently_effective_flag IS NULL OR CURRENTLY_EFFECTIVE_FLAG = UPPER(:currently_effective_flag))
  AND (
        :search IS NULL
        OR UPPER(BALANCE_CODE) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(BALANCE_NAME) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(DESCRIPTION) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(CATEGORY_NAME) LIKE '%' || UPPER(:search) || '%'
      )`;

export const COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
FROM ${VIEW}
${LIST_WHERE_SQL}`;

export const LIST_SQL = `
SELECT *
FROM ${VIEW}
${LIST_WHERE_SQL}
ORDER BY BALANCE_NAME, BALANCE_CODE
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;

export const GET_BY_GUID_SQL = `
SELECT *
FROM ${VIEW}
WHERE LOWER(REPLACE(BALANCE_DEFINITION_GUID, '-', '')) = LOWER(REPLACE(:balance_definition_guid, '-', ''))
  AND ENTERPRISE_ID = :enterprise_id`;

export const SUMMARY_SQL = `
SELECT
  COUNT(*) AS TOTAL_BALANCES,
  SUM(CASE WHEN ACTIVE_FLAG = 'Y' THEN 1 ELSE 0 END) AS ACTIVE_BALANCES,
  SUM(CASE WHEN ACTIVE_FLAG = 'N' THEN 1 ELSE 0 END) AS INACTIVE_BALANCES,
  SUM(CASE WHEN CURRENTLY_EFFECTIVE_FLAG = 'Y' THEN 1 ELSE 0 END) AS CURRENTLY_EFFECTIVE_BALANCES
FROM ${VIEW}
WHERE ENTERPRISE_ID = :enterprise_id`;

/**
 * @param {Record<string, unknown>} filters
 */
export function buildBalanceDefinitionListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    balance_category_id: filters.balance_category_id ?? null,
    category_code: filters.category_code ?? null,
    unit_of_measure_code: filters.unit_of_measure_code ?? null,
    balance_type_code: filters.balance_type_code ?? null,
    currency_code: filters.currency_code ?? null,
    active_flag: filters.active_flag ?? null,
    currently_effective_flag: filters.currently_effective_flag ?? null,
    search: filters.search ?? null
  };
}
