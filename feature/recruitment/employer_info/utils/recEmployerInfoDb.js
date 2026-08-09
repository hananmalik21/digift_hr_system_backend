/** Shared DB + message helpers for REC.EMPLOYER_INFO. */

import { withConnection } from '../../../../utils/oraclePackageUtils.js';

export { withConnection };

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
    'Content-Type must be multipart/form-data. Send employer fields and the logo file in one request.',
  LOGO_REQUIRED:
    'logo file is required. Send it in the same multipart/form-data request as the employer fields.'
});

/**
 * @param {string|null|undefined} status
 */
export function packageStatusIsSuccess(status) {
  const s = String(status ?? '')
    .trim()
    .toUpperCase();
  return s === 'S' || s === 'SUCCESS' || s === 'Y' || s === 'OK' || s === 'TRUE' || s === '1';
}
