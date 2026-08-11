export const ALLOWED_STATUSES = Object.freeze(['ACTIVE', 'INACTIVE']);
export const DEFAULT_STATUS = 'ACTIVE';

export const ALLOWED_MATCH_LOGIC_CODES = Object.freeze(['ANY', 'ALL']);
export const DEFAULT_MATCH_LOGIC_CODE = 'ANY';
export const DEFAULT_END_DATE = '4712-12-31';

export const HTTP_OK = 200;
export const HTTP_CREATED = 201;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;

export const GENERIC_TECHNICAL_ERROR =
  'Unable to process request. Please try again or contact support.';

export const NOT_FOUND_MESSAGE = 'Profile was not found.';
export const LINK_NOT_FOUND_MESSAGE = 'Profile element link was not found.';

export const CREATE_SUCCESS_MESSAGE = 'Eligibility profile created successfully.';
export const UPDATE_SUCCESS_MESSAGE = 'Eligibility profile updated successfully.';
export const LINK_SUCCESS_MESSAGE = 'Eligibility profile linked to element successfully.';
