export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);

export const DEFAULT_STATUS = 'ACTIVE';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 500;

export const NOT_FOUND_MESSAGE = 'Balance category not found.';

export const LIST_SUCCESS_MESSAGE = 'Balance categories retrieved successfully.';
export const GET_SUCCESS_MESSAGE = 'Balance category retrieved successfully.';

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';
export const GENERIC_READ_ERROR_MESSAGE =
  'Unable to fetch balance categories. Please try again.';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const HTTP_CONFLICT = 409;
