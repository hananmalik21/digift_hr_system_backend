/**
 * Shared constants for PAY Payroll Group Management.
 */

export const PKG = 'PAY.PAYROLL_GROUPS_PKG';
export const VIEW = 'PAY.V_PAYROLL_GROUPS';

export const LIST_DEFAULT_PAGE = 1;
export const LIST_DEFAULT_LIMIT = 20;
export const LIST_MAX_LIMIT = 100;

export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

/** Allowlisted sort_by keys → Oracle column names (never interpolate client input). */
export const ALLOWED_SORT_COLUMNS = Object.freeze({
  group_name: 'GROUP_NAME',
  group_code: 'GROUP_CODE',
  payroll_definition_name: 'PAYROLL_DEFINITION_NAME',
  country_name: 'COUNTRY_NAME',
  business_unit_name: 'BUSINESS_UNIT_NAME',
  worker_type_name: 'WORKER_TYPE_NAME',
  employee_count: 'EMPLOYEE_COUNT',
  rule_type_name: 'RULE_TYPE_NAME',
  status: 'STATUS',
  creation_date: 'CREATION_DATE',
  last_update_date: 'LAST_UPDATE_DATE'
});

export const DEFAULT_SORT_BY = 'group_name';
export const DEFAULT_SORT_ORDER = 'ASC';

export const GENERIC_ERROR_MESSAGE = 'Unable to process the payroll group request.';
export const VIEW_UNAVAILABLE_MESSAGE =
  'Payroll group configuration is currently unavailable. Please contact the system administrator.';
export const NOT_FOUND_MESSAGE = 'Payroll group does not exist.';
export const DELETE_CONFLICT_MESSAGE =
  'This payroll group cannot be deleted because it is being used by other payroll records.';
export const CREATE_RETRIEVE_FAILED_MESSAGE =
  'The payroll group was created but could not be retrieved.';
export const UPDATE_RETRIEVE_FAILED_MESSAGE =
  'The payroll group was updated but could not be retrieved.';

export const CREATE_SUCCESS_MESSAGE = 'Payroll group created successfully.';
export const LIST_SUCCESS_MESSAGE = 'Payroll groups retrieved successfully.';
export const SUMMARY_SUCCESS_MESSAGE = 'Payroll group summary retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Payroll group retrieved successfully.';
export const UPDATE_SUCCESS_MESSAGE = 'Payroll group updated successfully.';
export const DELETE_SUCCESS_MESSAGE = 'Payroll group deleted successfully.';

/** Oracle errorNums that indicate a broken / invalid view. */
export const INVALID_VIEW_ORACLE_ERROR_NUMS = Object.freeze([4063, 4098, 904]);
