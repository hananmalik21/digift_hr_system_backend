/**
 * Employee / run balance result reads.
 * Table: PAY.PAY_EMPLOYEE_BALANCE_RESULTS, joined to PAY.PAY_BALANCES + PAY.PAY_BALANCE_DIMENSIONS.
 * Employee GUID resolution: EMPL.EMPLOYEES.
 */
import { queryPayList, queryPayOne } from '../../shared/index.js';

const RESULTS_FROM = `
  PAY.PAY_EMPLOYEE_BALANCE_RESULTS r
  LEFT JOIN PAY.PAY_BALANCES b ON b.BALANCE_ID = r.BALANCE_ID
  LEFT JOIN PAY.PAY_BALANCE_DIMENSIONS d ON d.BALANCE_DIMENSION_ID = r.BALANCE_DIMENSION_ID
`;

const RESULTS_SELECT = `
  r.EMPLOYEE_BALANCE_RESULT_ID, r.EMPLOYEE_BALANCE_RESULT_GUID, r.ENTERPRISE_ID, r.RUN_ID, r.REL_ACTION_ID,
  r.PAYROLL_ID, r.EMPLOYEE_ID,
  r.BALANCE_ID, b.BALANCE_CODE, b.BALANCE_NAME_EN, b.BALANCE_NAME_AR, b.BALANCE_CATEGORY_CODE, b.BALANCE_UOM_CODE,
  r.BALANCE_DIMENSION_ID, d.DIMENSION_NAME, d.SCOPE_CODE, d.LEVEL_CODE, d.RESET_FREQUENCY_CODE,
  r.DIMENSION_PERIOD_START_DATE, r.DIMENSION_PERIOD_END_DATE,
  r.OPENING_VALUE, r.RUN_CONTRIBUTION_VALUE, r.CLOSING_VALUE, r.CURRENCY_CODE, r.STATUS_CODE,
  r.CALCULATED_DATE, r.FINALIZED_DATE, r.REVERSED_FLAG, r.REVERSED_DATE, r.REVERSED_BY, r.REVERSAL_REASON,
  r.CREATED_BY, r.CREATION_DATE, r.LAST_UPDATED_BY, r.LAST_UPDATE_DATE
`.trim();

const RESULTS_MAP_OPTIONS = {
  dates: ['DIMENSION_PERIOD_START_DATE', 'DIMENSION_PERIOD_END_DATE'],
  dateTimes: ['CALCULATED_DATE', 'FINALIZED_DATE', 'REVERSED_DATE', 'CREATION_DATE', 'LAST_UPDATE_DATE']
};

/**
 * Resolve EMPL.EMPLOYEES.EMPLOYEE_ID from a GUID.
 * @param {string} employeeGuidHex
 * @param {number|null} [enterpriseId]
 */
export async function resolveEmployeeIdByGuid(employeeGuidHex, enterpriseId = null) {
  const filters = [{ sql: 'v.EMPLOYEE_GUID = HEXTORAW(:employee_guid_hex)', bind: 'employee_guid_hex', value: employeeGuidHex }];
  if (enterpriseId != null) {
    filters.push({ sql: 'v.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: enterpriseId });
  }
  return queryPayOne({
    fromSql: 'EMPL.EMPLOYEES v',
    selectSql: 'v.EMPLOYEE_ID, v.ENTERPRISE_ID',
    alias: 'v',
    filters,
    logTag: 'payBalancesExt'
  });
}

/**
 * @param {{
 *   employee_id?, run_id?, enterprise_id?, balance_id?, balance_code?, dimension_id?,
 *   period_start_date?, period_end_date?, tax_year?, reset_frequency_code?, status_code?,
 *   page?, pageSize?
 * }} filters
 */
export async function listEmployeeBalanceResults(filters) {
  return queryPayList({
    fromSql: RESULTS_FROM,
    selectSql: RESULTS_SELECT,
    alias: 'r',
    filters: [
      { sql: 'r.EMPLOYEE_ID = :employee_id', bind: 'employee_id', value: filters.employee_id },
      { sql: 'r.RUN_ID = :run_id', bind: 'run_id', value: filters.run_id },
      { sql: 'r.ENTERPRISE_ID = :enterprise_id', bind: 'enterprise_id', value: filters.enterprise_id },
      { sql: 'r.BALANCE_ID = :balance_id', bind: 'balance_id', value: filters.balance_id },
      { sql: 'b.BALANCE_CODE = UPPER(:balance_code)', bind: 'balance_code', value: filters.balance_code },
      { sql: 'r.BALANCE_DIMENSION_ID = :dimension_id', bind: 'dimension_id', value: filters.dimension_id },
      { sql: 'd.RESET_FREQUENCY_CODE = UPPER(:reset_frequency_code)', bind: 'reset_frequency_code', value: filters.reset_frequency_code },
      { sql: 'r.STATUS_CODE = UPPER(:status_code)', bind: 'status_code', value: filters.status_code },
      { sql: 'r.DIMENSION_PERIOD_START_DATE >= TO_DATE(:period_start_date, \'YYYY-MM-DD\')', bind: 'period_start_date', value: filters.period_start_date },
      { sql: 'r.DIMENSION_PERIOD_END_DATE <= TO_DATE(:period_end_date, \'YYYY-MM-DD\')', bind: 'period_end_date', value: filters.period_end_date },
      { sql: 'TO_CHAR(r.DIMENSION_PERIOD_START_DATE, \'YYYY\') = :tax_year', bind: 'tax_year', value: filters.tax_year }
    ],
    defaultSort: 'r.DIMENSION_PERIOD_START_DATE DESC',
    allowedSort: {
      period_start: 'r.DIMENSION_PERIOD_START_DATE',
      closing_value: 'r.CLOSING_VALUE',
      creation_date: 'r.CREATION_DATE'
    },
    sortBy: filters.sort_by,
    sortOrder: filters.sort_order,
    page: filters.page,
    pageSize: filters.pageSize,
    mapOptions: RESULTS_MAP_OPTIONS,
    logTag: 'payBalancesExt'
  });
}
