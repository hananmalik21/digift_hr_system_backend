/** REC.EMPLOYER_INFO package, view, and table names. */

export const PKG = 'REC.REC_EMPLOYER_INFO_PKG';
export const VIEW = process.env.REC_EMPLOYER_INFO_VIEW || 'REC.V_EMPLOYER_INFO';
export const TABLE = 'REC.EMPLOYER_INFO';

export const ASSIGNMENT_TYPES = Object.freeze(['ENTERPRISE_LEVEL', 'COMPANY_LEVEL']);

export const ALLOWED_LOGO_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml'
]);

/** Default 5 MB logo upload limit. */
export const LOGO_MAX_BYTES =
  Number(process.env.REC_EMPLOYER_INFO_LOGO_MAX_BYTES) || 5 * 1024 * 1024;

export const ACTIONS = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  SET_STATUS: 'SET_STATUS',
  CLEAR_LOGO: 'CLEAR_LOGO'
});

export const MESSAGES = Object.freeze({
  FALLBACK: 'Unable to process employer information request. Please try again.',
  LIST_OK: 'Employer information retrieved successfully.',
  GET_OK: 'Employer information retrieved successfully.',
  CREATE_OK: 'Employer information created successfully.',
  UPDATE_OK: 'Employer information updated successfully.',
  DELETE_OK: 'Employer information deleted successfully.',
  STATUS_OK: 'Employer information status updated successfully.',
  CLEAR_LOGO_OK: 'Employer logo removed successfully.',
  NOT_FOUND: 'Employer information not found.',
  LOGO_NOT_FOUND: 'Employer logo not found.',
  LOGO_FETCH_FAIL: 'Unable to fetch employer logo. Please try again.',
  LIST_FAIL: 'Unable to list employer information. Please try again.',
  GET_FAIL: 'Unable to fetch employer information. Please try again.',
  MULTIPART_REQUIRED:
    'Content-Type must be multipart/form-data. Send employer fields as form fields; include the logo file when uploading a logo.',
  LOGO_REQUIRED:
    'logo file is required. Send it in the same multipart/form-data request as the employer fields.'
});
