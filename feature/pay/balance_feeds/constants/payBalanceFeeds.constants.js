export const FEED_TYPE_CODES = Object.freeze([
  'INPUT_VALUE',
  'CLASSIFICATION',
  'FORMULA',
  'ADJUSTMENT'
]);

export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

export const DEFAULT_END_DATE = '4712-12-31';
export const DEFAULT_STATUS = 'ACTIVE';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export const NOT_FOUND_MESSAGE = 'Balance feed not found.';

export const CREATE_SUCCESS_MESSAGE = 'Balance feed created successfully.';
export const UPDATE_SUCCESS_MESSAGE = 'Balance feed updated successfully.';
export const DELETE_SUCCESS_MESSAGE = 'Balance feed deactivated successfully.';
export const DELETE_HARD_SUCCESS_MESSAGE = 'Balance feed deleted successfully.';
export const LIST_SUCCESS_MESSAGE = 'Balance feeds retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Balance feed retrieved successfully.';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE = 'Unable to fetch balance feeds. Please try again.';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
