/**
 * Shared constants for PAY Balance Dimensions APIs.
 * Package: PAY.PAY_BALANCE_DIMENSIONS_PKG | View: PAY.V_PAY_BALANCE_DIMENSIONS
 */

export const PKG = 'PAY.PAY_BALANCE_DIMENSIONS_PKG';
export const VIEW = 'PAY.V_PAY_BALANCE_DIMENSIONS';

/** Suggested FNDSEC permission keys (not enforced until a shared permission middleware exists). */
export const PERMISSION_KEYS = Object.freeze({
  VIEW: 'PAY_BALANCE_DIMENSIONS_VIEW',
  CREATE: 'PAY_BALANCE_DIMENSIONS_CREATE',
  UPDATE: 'PAY_BALANCE_DIMENSIONS_UPDATE',
  DELETE: 'PAY_BALANCE_DIMENSIONS_DELETE'
});

/** CREATE_DIMENSION is available on PAY.PAY_BALANCE_DIMENSIONS_PKG. */

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Allowlisted sort_by keys → Oracle column names (never interpolate client input). */
export const ALLOWED_SORT_COLUMNS = Object.freeze({
  dimension_name: 'DIMENSION_NAME',
  scope_name: 'SCOPE_NAME',
  level_name: 'LEVEL_NAME',
  reset_frequency_name: 'RESET_FREQUENCY_NAME',
  status_name: 'STATUS_NAME',
  display_sequence: 'DISPLAY_SEQUENCE',
  creation_date: 'CREATION_DATE',
  last_update_date: 'LAST_UPDATE_DATE'
});

/** Default ORDER BY when sort_by is omitted. */
export const DEFAULT_ORDER_BY_SQL = 'NVL(DISPLAY_SEQUENCE, 999999), DIMENSION_NAME';

export const DEFAULT_SORT_ORDER = 'ASC';

export const NOT_FOUND_MESSAGE = 'Balance dimension does not exist.';
export const LIST_SUCCESS_MESSAGE = 'Balance dimensions retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Balance dimension retrieved successfully.';
export const UPDATE_SUCCESS_MESSAGE = 'Balance dimension updated successfully.';
export const CREATE_SUCCESS_MESSAGE = 'Balance dimension created successfully.';
export const UPDATE_RETRIEVE_FAILED_MESSAGE =
  'The balance dimension was updated but could not be retrieved.';
export const CREATE_RETRIEVE_FAILED_MESSAGE =
  'The balance dimension was created but could not be retrieved.';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE =
  'Unable to fetch balance dimensions. Please try again.';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_INTERNAL = 500;
