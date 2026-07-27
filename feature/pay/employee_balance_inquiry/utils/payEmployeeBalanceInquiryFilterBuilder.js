/**
 * SQL builders for Employee Balance Inquiry (read-only).
 * Bind-variable filters only — never concatenate request values into SQL.
 */
import {
  TABLE_BALANCE_DIMENSIONS,
  TABLE_BALANCE_INITIALIZATIONS,
  VIEW
} from '../constants/payEmployeeBalanceInquiry.constants.js';

const VIEW_COLUMNS = Object.freeze([
  'ENTERPRISE_ID',
  'EMPLOYEE_ID',
  'EMPLOYEE_GUID',
  'EMPLOYEE_NUMBER',
  'EMPLOYEE_NAME',
  'EMPLOYEE_NAME_EN',
  'EMPLOYEE_NAME_AR',
  'EMPLOYEE_INITIALS',
  'EMAIL',
  'ASSIGNMENT_ID',
  'ASSIGNMENT_GUID',
  'WORK_LOCATION_ID',
  'POSITION_ID',
  'POSITION_GUID',
  'JOB_FAMILY_ID',
  'JOB_LEVEL_ID',
  'GRADE_ID',
  'ENTERPRISE_HIRE_DATE',
  'CONTRACT_TYPE_CODE',
  'PAYROLL_ID',
  'PAYROLL_NAME',
  'BALANCE_ID',
  'BALANCE_GUID',
  'BALANCE_CODE',
  'BALANCE_NAME',
  'BALANCE_NAME_EN',
  'BALANCE_NAME_AR',
  'BALANCE_CATEGORY_ID',
  'BALANCE_CATEGORY_CODE',
  'BALANCE_UOM_CODE',
  'BALANCE_TYPE_CODE',
  'CURRENCY_CODE',
  'DISPLAY_UOM_CODE',
  'CURRENT_VALUE',
  'MTD_VALUE',
  'QTD_VALUE',
  'YTD_VALUE',
  'ITD_VALUE',
  'CURRENT_EFFECTIVE_DATE',
  'MTD_EFFECTIVE_DATE',
  'QTD_EFFECTIVE_DATE',
  'YTD_EFFECTIVE_DATE',
  'ITD_EFFECTIVE_DATE',
  'LAST_EFFECTIVE_DATE',
  'LAST_UPDATED_DATE'
]);

/** Dimension → CURRENT/MTD/QTD/YTD/ITD mapping (static SQL literals only). */
const DIMENSION_PIVOTS = Object.freeze([
  {
    prefix: 'CURRENT',
    scopes: ['PAYROLL_RUN', 'RUN', 'CURRENT'],
    resets: ['PER_RUN']
  },
  {
    prefix: 'MTD',
    scopes: ['MONTH_TO_DATE', 'MTD'],
    resets: ['MONTHLY']
  },
  {
    prefix: 'QTD',
    scopes: ['QUARTER_TO_DATE', 'QTD'],
    resets: ['QUARTERLY']
  },
  {
    prefix: 'YTD',
    scopes: ['YEAR_TO_DATE', 'YTD'],
    resets: ['YEARLY']
  },
  {
    prefix: 'ITD',
    scopes: ['INCEPTION_TO_DATE', 'ITD', 'LIFETIME'],
    resets: ['NEVER', 'NO_RESET']
  }
]);

/**
 * @param {string} [alias] Table/view alias; empty for unaliased filters.
 */
export function buildViewFilterWhere(alias = '') {
  const col = (name) => (alias ? `${alias}.${name}` : name);
  const searchCols = ['EMPLOYEE_SEARCH_KEY', 'EMPLOYEE_NUMBER', 'EMPLOYEE_NAME', 'EMAIL'];

  const searchPredicate = searchCols
    .map(
      (name) =>
        `OR UPPER(NVL(${col(name)}, '')) LIKE '%' || UPPER(:search) || '%'`
    )
    .join('\n        ');

  return `
WHERE ${col('ENTERPRISE_ID')} = :enterprise_id
  AND (:employee_id IS NULL OR ${col('EMPLOYEE_ID')} = :employee_id)
  AND (
        :employee_guid IS NULL
        OR LOWER(REPLACE(${col('EMPLOYEE_GUID')}, '-', '')) =
           LOWER(REPLACE(:employee_guid, '-', ''))
      )
  AND (
        :search IS NULL
        ${searchPredicate}
      )
  AND (:payroll_id IS NULL OR ${col('PAYROLL_ID')} = :payroll_id)
  AND (
        :balance_category_code IS NULL
        OR UPPER(${col('BALANCE_CATEGORY_CODE')}) = UPPER(:balance_category_code)
      )`;
}

function sqlInList(values) {
  return values.map((v) => `'${v}'`).join(', ');
}

function dimensionMatchSql(scopes, resets) {
  const scopeSql = `UPPER(NVL(d.SCOPE_CODE, '')) IN (${sqlInList(scopes)})`;
  const resetSql =
    resets.length === 1
      ? `UPPER(NVL(d.RESET_FREQUENCY_CODE, '')) = '${resets[0]}'`
      : `UPPER(NVL(d.RESET_FREQUENCY_CODE, '')) IN (${sqlInList(resets)})`;
  return `${scopeSql} OR ${resetSql}`;
}

/**
 * Pivot one measure (BALANCE_VALUE or EFFECTIVE_DATE) across dimensions.
 * Does not fall back across dimensions — unmatched dimensions stay NULL.
 */
function buildPivotMeasureSql(column, asPrefix) {
  return DIMENSION_PIVOTS.map(({ prefix, scopes, resets }) => {
    const match = dimensionMatchSql(scopes, resets);
    return `MAX(CASE WHEN ${match} THEN li.${column} END) AS ${prefix}_${asPrefix}`;
  }).join(',\n      ');
}

function buildViewSelectList(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return VIEW_COLUMNS.map((c) => `${prefix}${c}`).join(',\n    ');
}

function buildJoinedSelectList() {
  const metaCols = VIEW_COLUMNS.filter(
    (c) =>
      !c.endsWith('_VALUE') &&
      !c.endsWith('_EFFECTIVE_DATE') &&
      c !== 'LAST_UPDATED_DATE'
  );
  const meta = metaCols.map((c) => `v.${c}`).join(',\n      ');
  const pivoted = [
    ...DIMENSION_PIVOTS.map(({ prefix }) => `p.${prefix}_VALUE`),
    ...DIMENSION_PIVOTS.map(({ prefix }) => `p.${prefix}_EFFECTIVE_DATE`),
    'p.LAST_EFFECTIVE_DATE',
    'p.LAST_UPDATED_DATE'
  ].join(',\n      ');
  return `${meta},\n      ${pivoted}`;
}

const PAGE_ORDER = `
ORDER BY
  r.EMP_RANK,
  r.BALANCE_NAME ASC NULLS LAST,
  r.BALANCE_ID ASC NULLS LAST`;

export const CURRENT_SNAPSHOT_SQL = `
WITH base AS (
  SELECT
    ${buildViewSelectList()}
  FROM ${VIEW}
  ${buildViewFilterWhere()}
),
ranked AS (
  SELECT
    b.*,
    DENSE_RANK() OVER (ORDER BY NVL(UPPER(b.EMPLOYEE_NAME), CHR(1)), b.EMPLOYEE_ID) AS EMP_RANK
  FROM base b
)
SELECT r.*
FROM ranked r
WHERE r.EMP_RANK > :offset
  AND r.EMP_RANK <= (:offset + :limit)
${PAGE_ORDER}`;

export const CURRENT_COUNT_SQL = `
SELECT COUNT(*) AS TOTAL_RECORDS
FROM (
  SELECT DISTINCT EMPLOYEE_ID
  FROM ${VIEW}
  ${buildViewFilterWhere()}
)`;

const AS_OF_JOINED_CTE = `
WITH latest_init AS (
  SELECT
      bi.ENTERPRISE_ID,
      bi.EMPLOYEE_ID,
      bi.BALANCE_ID,
      bi.BALANCE_DIMENSION_ID,
      bi.BALANCE_INITIALIZATION_ID,
      bi.EFFECTIVE_DATE,
      bi.BALANCE_VALUE,
      bi.LAST_UPDATE_DATE,
      ROW_NUMBER() OVER (
        PARTITION BY
          bi.ENTERPRISE_ID,
          bi.EMPLOYEE_ID,
          bi.BALANCE_ID,
          bi.BALANCE_DIMENSION_ID
        ORDER BY
          bi.EFFECTIVE_DATE DESC,
          bi.BALANCE_INITIALIZATION_ID DESC
      ) AS RN
  FROM ${TABLE_BALANCE_INITIALIZATIONS} bi
  WHERE bi.ENTERPRISE_ID = :enterprise_id
    AND bi.EFFECTIVE_DATE <= TO_DATE(:as_of_date, 'YYYY-MM-DD')
    AND (:employee_id IS NULL OR bi.EMPLOYEE_ID = :employee_id)
),
pivoted AS (
  SELECT
      li.ENTERPRISE_ID,
      li.EMPLOYEE_ID,
      li.BALANCE_ID,
      ${buildPivotMeasureSql('BALANCE_VALUE', 'VALUE')},
      ${buildPivotMeasureSql('EFFECTIVE_DATE', 'EFFECTIVE_DATE')},
      MAX(li.EFFECTIVE_DATE) AS LAST_EFFECTIVE_DATE,
      MAX(li.LAST_UPDATE_DATE) AS LAST_UPDATED_DATE
  FROM latest_init li
  INNER JOIN ${TABLE_BALANCE_DIMENSIONS} d
    ON d.BALANCE_DIMENSION_ID = li.BALANCE_DIMENSION_ID
   AND d.ENTERPRISE_ID = li.ENTERPRISE_ID
  WHERE li.RN = 1
  GROUP BY
      li.ENTERPRISE_ID,
      li.EMPLOYEE_ID,
      li.BALANCE_ID
),
joined AS (
  SELECT
      ${buildJoinedSelectList()}
  FROM ${VIEW} v
  INNER JOIN pivoted p
    ON p.ENTERPRISE_ID = v.ENTERPRISE_ID
   AND p.EMPLOYEE_ID = v.EMPLOYEE_ID
   AND p.BALANCE_ID = v.BALANCE_ID
  ${buildViewFilterWhere('v')}
)`;

export const AS_OF_SQL = `
${AS_OF_JOINED_CTE},
ranked AS (
  SELECT
    j.*,
    DENSE_RANK() OVER (ORDER BY NVL(UPPER(j.EMPLOYEE_NAME), CHR(1)), j.EMPLOYEE_ID) AS EMP_RANK
  FROM joined j
)
SELECT r.*
FROM ranked r
WHERE r.EMP_RANK > :offset
  AND r.EMP_RANK <= (:offset + :limit)
${PAGE_ORDER}`;

export const AS_OF_COUNT_SQL = `
${AS_OF_JOINED_CTE}
SELECT COUNT(DISTINCT EMPLOYEE_ID) AS TOTAL_RECORDS
FROM joined`;

/**
 * @param {Record<string, unknown>} filters
 * @param {{ includePagination?: boolean, includeAsOf?: boolean }} [options]
 */
export function buildInquiryBinds(filters, { includePagination = true, includeAsOf = false } = {}) {
  const binds = {
    enterprise_id: filters.enterprise_id,
    employee_id: filters.employee_id ?? null,
    employee_guid: filters.employee_guid ?? null,
    search: filters.search ?? null,
    payroll_id: filters.payroll_id ?? null,
    balance_category_code: filters.balance_category_code ?? null
  };

  if (includeAsOf) binds.as_of_date = filters.as_of_date;
  if (includePagination) {
    binds.offset = filters.offset;
    binds.limit = filters.limit;
  }

  return binds;
}

export function hasAsOfDate(filters) {
  return filters?.as_of_date != null && String(filters.as_of_date).trim() !== '';
}
