/**
 * Payroll Person Results — Oracle view names and API copy.
 * Views remain the authoritative read models; Node does not rebuild joins.
 */

export const PERSON_RESULTS_VIEW = 'PAY.V_PAY_PERSON_RESULTS';
export const PERSON_PROCESS_RESULTS_VIEW = 'PAY.V_PAY_PERSON_PROCESS_RESULTS';

export const LOG_TAG = 'payPersonResults';

export const PERSON_SEARCH_COLUMNS = [
  'v.EMPLOYEE_NAME',
  'v.PERSON_NUMBER',
  'v.ASSIGNMENT_NUMBER',
  'v.BUSINESS_TITLE',
  'v.WORK_EMAIL'
];

export const FLOW_COLUMNS = [
  'FLOW_NAME',
  'FLOW_ID',
  'FLOW_CODE',
  'FLOW_INSTANCE_ID',
  'FLOW_INSTANCE_NAME'
];

export const JSON_OBJECT_COLUMNS = ['REL_ACTION_OBJ', 'PAYROLL_DEFINITION_OBJ'];

export const TEXT_IDENTIFIER_COLUMNS = [
  'person_number',
  'assignment_number',
  'work_phone',
  'mobile_number',
  'assignment_is_active',
  'work_email',
  'can_view_results'
];

export const MESSAGES = {
  PERSON_LIST: 'Payroll person results retrieved successfully.',
  PROCESS_LIST: 'Payroll process results retrieved successfully.',
  CALCULATION_LIST: 'Payroll calculation results retrieved successfully.',
  PERSON_NOT_FOUND: 'Payroll person result not found.'
};
