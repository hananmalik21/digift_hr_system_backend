import {
  ALLOWED_SORT_COLUMNS,
  DEFAULT_ORDER_BY_SQL,
  VIEW
} from '../constants/payBalanceDimensions.constants.js';

export const LIST_WHERE_SQL = `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:status_code IS NULL OR STATUS_CODE = UPPER(:status_code))
  AND (:scope_code IS NULL OR SCOPE_CODE = UPPER(:scope_code))
  AND (:level_code IS NULL OR LEVEL_CODE = UPPER(:level_code))
  AND (:reset_frequency_code IS NULL OR RESET_FREQUENCY_CODE = UPPER(:reset_frequency_code))
  AND (
        :search IS NULL
        OR UPPER(DIMENSION_NAME) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(SCOPE_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(LEVEL_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(RESET_FREQUENCY_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(DESCRIPTION, '')) LIKE '%' || UPPER(:search) || '%'
      )`;

export const COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
FROM ${VIEW}
${LIST_WHERE_SQL}`;

/**
 * Resolve ORDER BY from an allowlisted sort_by key.
 * When sort_by is omitted / null, uses NVL(DISPLAY_SEQUENCE, 999999), DIMENSION_NAME.
 * @param {string|null|undefined} sortBy
 * @param {string} [sortOrder]
 */
export function resolveOrderBySql(sortBy, sortOrder = 'ASC') {
  if (sortBy == null || String(sortBy).trim() === '') {
    return `ORDER BY ${DEFAULT_ORDER_BY_SQL}`;
  }

  const key = String(sortBy).trim().toLowerCase();
  const column = ALLOWED_SORT_COLUMNS[key];
  if (!column) {
    return `ORDER BY ${DEFAULT_ORDER_BY_SQL}`;
  }

  const order = String(sortOrder || 'ASC').trim().toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
  return `ORDER BY ${column} ${order}, ${DEFAULT_ORDER_BY_SQL}`;
}

/**
 * @param {Record<string, unknown>} filters
 */
export function buildListSql(filters) {
  return `
SELECT *
FROM ${VIEW}
${LIST_WHERE_SQL}
${resolveOrderBySql(filters.sort_by, filters.sort_order)}
OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`;
}

export const GET_BY_GUID_SQL = `
SELECT *
FROM ${VIEW}
WHERE LOWER(REPLACE(BALANCE_DIMENSION_GUID, '-', '')) = LOWER(REPLACE(:balance_dimension_guid, '-', ''))
  AND ENTERPRISE_ID = :enterprise_id`;

/**
 * @param {Record<string, unknown>} filters
 */
export function buildBalanceDimensionListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    status_code: filters.status_code ?? null,
    scope_code: filters.scope_code ?? null,
    level_code: filters.level_code ?? null,
    reset_frequency_code: filters.reset_frequency_code ?? null,
    search: filters.search ?? null
  };
}
