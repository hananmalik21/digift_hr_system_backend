/**
 * Shared constants for PAY Balance Initializations APIs.
 * Package: PAY.PAY_BALANCE_INITIALIZATIONS_PKG
 * View: PAY.V_PAY_BALANCE_INITIALIZATIONS
 */

export const PKG = 'PAY.PAY_BALANCE_INITIALIZATIONS_PKG';
export const VIEW = 'PAY.V_PAY_BALANCE_INITIALIZATIONS';

/** Suggested FNDSEC permission keys (not enforced — no shared permission middleware yet). */
export const PERMISSION_KEYS = Object.freeze({
  VIEW: 'PAY_BALANCE_INITIALIZATIONS_VIEW',
  CREATE: 'PAY_BALANCE_INITIALIZATIONS_CREATE',
  UPDATE: 'PAY_BALANCE_INITIALIZATIONS_UPDATE',
  DELETE: 'PAY_BALANCE_INITIALIZATIONS_DELETE',
  EXPORT: 'PAY_BALANCE_INITIALIZATIONS_EXPORT'
});

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const EXPORT_MAX_ROWS = 50000;

export const ALLOWED_SORT_COLUMNS = Object.freeze({
  employee_name: 'EMPLOYEE_NAME',
  balance_name_en: 'BALANCE_NAME_EN',
  dimension_name: 'DIMENSION_NAME',
  balance_value: 'BALANCE_VALUE',
  effective_date: 'EFFECTIVE_DATE',
  reason_name: 'REASON_NAME',
  source_type_name: 'SOURCE_TYPE_NAME',
  status_name: 'STATUS_NAME',
  creation_date: 'CREATION_DATE',
  last_update_date: 'LAST_UPDATE_DATE'
});

export const DEFAULT_SORT_BY = 'creation_date';
export const DEFAULT_SORT_ORDER = 'DESC';

export const NOT_FOUND_MESSAGE = 'Balance initialization does not exist.';
export const LIST_SUCCESS_MESSAGE = 'Balance initialization history retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Balance initialization retrieved successfully.';
export const CREATE_SUCCESS_MESSAGE = 'Balance initialized successfully.';
export const UPDATE_SUCCESS_MESSAGE = 'Balance initialization updated successfully.';
export const CREATE_RETRIEVE_FAILED_MESSAGE =
  'The balance initialization was created but could not be retrieved.';
export const UPDATE_RETRIEVE_FAILED_MESSAGE =
  'The balance initialization was updated but could not be retrieved.';
export const EXPORT_EMPTY_MESSAGE = 'No balance initializations found to export.';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE =
  'Unable to fetch balance initializations. Please try again.';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
export const HTTP_INTERNAL = 500;

export const MAX_COMMENTS_LENGTH = 2000;
export const MAX_SOURCE_REFERENCE_LENGTH = 500;
export const MAX_ERROR_MESSAGE_LENGTH = 2000;
