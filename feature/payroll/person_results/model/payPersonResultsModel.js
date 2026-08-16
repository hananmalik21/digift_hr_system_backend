/**
 * Repository for PAY.V_PAY_PERSON_RESULTS and PAY.V_PAY_PERSON_PROCESS_RESULTS.
 * Named binds only. No employee/assignment/NET_PAY joins in Node.
 */

import { queryPayList, queryPayOne } from '../../shared/payrollViewQuery.js';
import {
  LOG_TAG,
  PERSON_PROCESS_RESULTS_VIEW,
  PERSON_RESULTS_VIEW,
  PERSON_SEARCH_COLUMNS
} from '../constants.js';
import { mapPersonProcessResultRow, mapPersonResultRow } from '../utils/payPersonResultsMappers.js';

const ACTIVE_ASSIGNMENT_SQL = `(
  UPPER(NVL(v.ASSIGNMENT_IS_ACTIVE, 'Y')) = 'Y'
  AND (
    v.ASSIGNMENT_EFFECTIVE_END_DATE IS NULL
    OR v.ASSIGNMENT_EFFECTIVE_END_DATE >= TRUNC(SYSDATE)
  )
)`;

const EFFECTIVE_AS_OF_SQL = `(
  v.ASSIGNMENT_EFFECTIVE_START_DATE <= :effective_as_of_date
  AND (
    v.ASSIGNMENT_EFFECTIVE_END_DATE IS NULL
    OR v.ASSIGNMENT_EFFECTIVE_END_DATE >= :effective_as_of_date
  )
)`;

function eq(column, bind, value) {
  return { sql: `v.${column} = :${bind}`, bind, value };
}

function eqUpper(column, bind, value) {
  return { sql: `UPPER(v.${column}) = UPPER(:${bind})`, bind, value };
}

function viewList(fromSql, filters, mapRow, extra = {}) {
  return queryPayList({
    fromSql: `${fromSql} v`,
    alias: 'v',
    filters,
    mapRow,
    logTag: LOG_TAG,
    ...extra
  });
}

/**
 * @param {{
 *   enterprise_id: number,
 *   search?: string|null,
 *   business_title?: string|null,
 *   assignment_status?: string|null,
 *   employment_status?: string|null,
 *   worker_type?: string|null,
 *   effective_as_of_date?: Date|null,
 *   include_terminated_work_relationships?: 'Y'|'N',
 *   page: number,
 *   pageSize: number
 * }} filters
 */
export async function listPersonResults(filters) {
  const clauses = [
    eq('ENTERPRISE_ID', 'enterprise_id', filters.enterprise_id),
    eqUpper('BUSINESS_TITLE', 'business_title', filters.business_title),
    eqUpper('ASSIGNMENT_STATUS', 'assignment_status', filters.assignment_status),
    eqUpper('EMPLOYMENT_STATUS', 'employment_status', filters.employment_status),
    eqUpper('WORKER_TYPE', 'worker_type', filters.worker_type),
    { sql: EFFECTIVE_AS_OF_SQL, bind: 'effective_as_of_date', value: filters.effective_as_of_date }
  ];

  if (filters.include_terminated_work_relationships !== 'Y') {
    clauses.push({ sql: ACTIVE_ASSIGNMENT_SQL, skipIfEmpty: false });
  }

  return viewList(PERSON_RESULTS_VIEW, clauses, mapPersonResultRow, {
    search: { columns: PERSON_SEARCH_COLUMNS, value: filters.search },
    defaultSort: 'v.EMPLOYEE_NAME ASC',
    page: filters.page,
    pageSize: filters.pageSize
  });
}

/**
 * @param {number} enterpriseId
 * @param {number} employeeId
 */
export async function getPersonResult(enterpriseId, employeeId) {
  return queryPayOne({
    fromSql: `${PERSON_RESULTS_VIEW} v`,
    alias: 'v',
    filters: [
      eq('ENTERPRISE_ID', 'enterprise_id', enterpriseId),
      eq('EMPLOYEE_ID', 'employee_id', employeeId)
    ],
    mapRow: mapPersonResultRow,
    logTag: LOG_TAG
  });
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_id: number,
 *   payroll_id?: number|null,
 *   run_id?: number|null,
 *   status?: string|null,
 *   period_start_date?: Date|null,
 *   period_end_date?: Date|null,
 *   page: number,
 *   pageSize: number
 * }} filters
 */
export async function listPersonProcessResults(filters) {
  return viewList(
    PERSON_PROCESS_RESULTS_VIEW,
    [
      eq('ENTERPRISE_ID', 'enterprise_id', filters.enterprise_id),
      eq('EMPLOYEE_ID', 'employee_id', filters.employee_id),
      eq('PAYROLL_ID', 'payroll_id', filters.payroll_id),
      eq('RUN_ID', 'run_id', filters.run_id),
      eqUpper('STATUS', 'status', filters.status),
      {
        sql: 'v.PERIOD_START_DATE >= :period_start_date',
        bind: 'period_start_date',
        value: filters.period_start_date
      },
      {
        sql: 'v.PERIOD_END_DATE <= :period_end_date',
        bind: 'period_end_date',
        value: filters.period_end_date
      }
    ],
    mapPersonProcessResultRow,
    {
      defaultSort: 'v.PROCESS_DATE DESC',
      page: filters.page,
      pageSize: filters.pageSize
    }
  );
}
