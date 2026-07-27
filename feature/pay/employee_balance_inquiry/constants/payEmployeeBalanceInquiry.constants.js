/**
 * Shared constants for Employee Balance Inquiry API.
 * Current snapshot: PAY.V_EMPLOYEE_BALANCE_INQUIRY
 * As-of (read-only): PAY.PAY_BALANCE_INITIALIZATIONS, PAY.PAY_BALANCE_DIMENSIONS
 */

export const VIEW = 'PAY.V_EMPLOYEE_BALANCE_INQUIRY';
export const TABLE_BALANCE_INITIALIZATIONS = 'PAY.PAY_BALANCE_INITIALIZATIONS';
export const TABLE_BALANCE_DIMENSIONS = 'PAY.PAY_BALANCE_DIMENSIONS';

/** Suggested FNDSEC permission key (not enforced — no shared permission middleware yet). */
export const PERMISSION_KEYS = Object.freeze({
  VIEW: 'PAY_EMPLOYEE_BALANCE_INQUIRY_VIEW'
});

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_BALANCE_CATEGORY_CODE_LENGTH = 100;

export const LIST_SUCCESS_MESSAGE = 'Employee balance inquiry retrieved successfully.';
export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE =
  'Unable to fetch employee balance inquiry data. Please try again.';

export const HTTP_OK = 200;
