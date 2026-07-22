import {
  ALLOWED_SORT_COLUMNS,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
  VIEW
} from '../constants/payBalanceInitializations.constants.js';

export const LIST_WHERE_SQL = `
WHERE ENTERPRISE_ID = :enterprise_id
  AND (:employee_id IS NULL OR EMPLOYEE_ID = :employee_id)
  AND (
        :employee_guid IS NULL
        OR LOWER(REPLACE(EMPLOYEE_GUID, '-', '')) = LOWER(REPLACE(:employee_guid, '-', ''))
      )
  AND (:balance_id IS NULL OR BALANCE_ID = :balance_id)
  AND (
        :balance_guid IS NULL
        OR LOWER(REPLACE(BALANCE_GUID, '-', '')) = LOWER(REPLACE(:balance_guid, '-', ''))
      )
  AND (:balance_dimension_id IS NULL OR BALANCE_DIMENSION_ID = :balance_dimension_id)
  AND (
        :balance_dimension_guid IS NULL
        OR LOWER(REPLACE(BALANCE_DIMENSION_GUID, '-', '')) =
           LOWER(REPLACE(:balance_dimension_guid, '-', ''))
      )
  AND (
        :effective_date_from IS NULL
        OR TRUNC(EFFECTIVE_DATE) >= TO_DATE(:effective_date_from, 'YYYY-MM-DD')
      )
  AND (
        :effective_date_to IS NULL
        OR TRUNC(EFFECTIVE_DATE) <= TO_DATE(:effective_date_to, 'YYYY-MM-DD')
      )
  AND (:reason_code IS NULL OR REASON_CODE = UPPER(:reason_code))
  AND (:source_type_code IS NULL OR SOURCE_TYPE_CODE = UPPER(:source_type_code))
  AND (:status_code IS NULL OR STATUS_CODE = UPPER(:status_code))
  AND (:upload_batch_id IS NULL OR UPLOAD_BATCH_ID = :upload_batch_id)
  AND (
        :search IS NULL
        OR UPPER(NVL(EMPLOYEE_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(EMPLOYEE_EMAIL, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(BALANCE_CODE, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(BALANCE_NAME_EN, '')) LIKE '%' || UPPER(:search) || '%'
        OR (
              BALANCE_NAME_AR IS NOT NULL
              AND UPPER(CAST(BALANCE_NAME_AR AS VARCHAR2(4000))) LIKE '%' || UPPER(:search) || '%'
            )
        OR UPPER(NVL(DIMENSION_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(REASON_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(SOURCE_TYPE_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(STATUS_NAME, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(COMMENTS, '')) LIKE '%' || UPPER(:search) || '%'
        OR UPPER(NVL(SOURCE_REFERENCE, '')) LIKE '%' || UPPER(:search) || '%'
      )`;

export const COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
FROM ${VIEW}
${LIST_WHERE_SQL}`;

/**
 * @param {string|null|undefined} sortBy
 * @param {string} [sortOrder]
 */
export function resolveOrderBySql(sortBy, sortOrder = DEFAULT_SORT_ORDER) {
  const key =
    sortBy != null && String(sortBy).trim() !== ''
      ? String(sortBy).trim().toLowerCase()
      : DEFAULT_SORT_BY;
  const column = ALLOWED_SORT_COLUMNS[key] || ALLOWED_SORT_COLUMNS[DEFAULT_SORT_BY];
  const order = String(sortOrder || DEFAULT_SORT_ORDER).trim().toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  return `ORDER BY ${column} ${order}`;
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

/**
 * Export query — same filters/sort, no pagination (capped by caller limit).
 * @param {Record<string, unknown>} filters
 */
export function buildExportSql(filters) {
  return `
SELECT *
FROM ${VIEW}
${LIST_WHERE_SQL}
${resolveOrderBySql(filters.sort_by, filters.sort_order)}
FETCH FIRST :limit ROWS ONLY`;
}

export const GET_BY_GUID_SQL = `
SELECT *
FROM ${VIEW}
WHERE LOWER(REPLACE(BALANCE_INITIALIZATION_GUID, '-', '')) =
      LOWER(REPLACE(:balance_initialization_guid, '-', ''))
  AND ENTERPRISE_ID = :enterprise_id`;

/**
 * @param {Record<string, unknown>} filters
 */
export function buildBalanceInitializationListBinds(filters) {
  return {
    enterprise_id: filters.enterprise_id,
    employee_id: filters.employee_id ?? null,
    employee_guid: filters.employee_guid ?? null,
    balance_id: filters.balance_id ?? null,
    balance_guid: filters.balance_guid ?? null,
    balance_dimension_id: filters.balance_dimension_id ?? null,
    balance_dimension_guid: filters.balance_dimension_guid ?? null,
    effective_date_from: filters.effective_date_from ?? null,
    effective_date_to: filters.effective_date_to ?? null,
    reason_code: filters.reason_code ?? null,
    source_type_code: filters.source_type_code ?? null,
    status_code: filters.status_code ?? null,
    upload_batch_id: filters.upload_batch_id ?? null,
    search: filters.search ?? null
  };
}
