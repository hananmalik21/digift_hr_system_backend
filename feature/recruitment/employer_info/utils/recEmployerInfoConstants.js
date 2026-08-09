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
