export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 500;

export const DEFAULT_ACTIVE_FLAG = 'Y';

export const NOT_FOUND_MESSAGE = 'Balance definition not found.';

export const LIST_SUCCESS_MESSAGE = 'Balance definitions retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Balance definition retrieved successfully.';
export const SUMMARY_SUCCESS_MESSAGE = 'Balance definition summary retrieved successfully.';
export const CATEGORIES_SUCCESS_MESSAGE = 'Balance categories retrieved successfully.';
export const LOOKUPS_SUCCESS_MESSAGE = 'Balance setup lookups retrieved successfully.';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE =
  'Unable to fetch balance definitions. Please try again.';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;

export const SUPPORTED_LOOKUP_TYPES = Object.freeze([
  'BALANCE_TYPE',
  'BALANCE_UNIT_OF_MEASURE',
  'BALANCE_DIMENSION_PERIOD',
  'BALANCE_DIMENSION_LEVEL',
  'CURRENCY'
]);

export const LOOKUP_TYPE_RESPONSE_KEYS = Object.freeze({
  BALANCE_TYPE: 'balance_types',
  BALANCE_UNIT_OF_MEASURE: 'units_of_measure',
  BALANCE_DIMENSION_PERIOD: 'dimension_periods',
  BALANCE_DIMENSION_LEVEL: 'dimension_levels',
  CURRENCY: 'currencies'
});
