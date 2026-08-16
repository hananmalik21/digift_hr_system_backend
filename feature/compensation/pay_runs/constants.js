/**
 * Compensation pay-run details — messages, pagination defaults, view name.
 */

export const VIEW = 'COMP.V_COMP_PAY_RUN_DETAILS';
export const LOG_TAG = 'compPayRunDetails';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

export const MESSAGES = Object.freeze({
  INVALID_ENTERPRISE_ID: 'Invalid enterprise_id',
  INVALID_PAY_RUN_ID: 'Invalid payRunId',
  INVALID_EMPLOYEE_ID: 'Invalid employee_id',
  INVALID_PAGE: 'Invalid page',
  INVALID_LIMIT: 'Invalid limit',
  INVALID_RUN_TYPE: 'Invalid run_type',
  INVALID_RUN_STATUS: 'Invalid run_status',
  INVALID_PROCESS_YEAR: 'Invalid process_year',
  INVALID_PROCESS_MONTH_NO: 'Invalid process_month_no',
  PAY_RUN_NOT_FOUND: 'Pay run not found',
  EMPLOYEE_NOT_FOUND: 'Employee not found in the specified pay run',
  DB_FALLBACK: 'Unable to fetch pay run details. Please try again later.'
});
