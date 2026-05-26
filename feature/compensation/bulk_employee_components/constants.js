export const VIEW_NAME = 'COMP.COMP_EMP_COMPONENTS_JSON_V';
export const LOG_TAG = 'bulkEmployeeComponents';
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 10;

export const COMPONENT_RESPONSE_FIELDS = Object.freeze([
  'assignment_detail_id',
  'plan_id',
  'component_id',
  'component_code',
  'component_name',
  'amount',
  'currency_code',
  'frequency_code',
  'process_status'
]);

export const API_FALLBACK_ERROR =
  'Unable to fetch employee components. Please try again later.';
