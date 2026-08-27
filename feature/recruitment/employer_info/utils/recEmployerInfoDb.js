/** Shared DB helpers for REC.EMPLOYER_INFO. */

import { withConnection, packageStatusIsSuccess } from '../../../../utils/oraclePackageUtils.js';
import { MESSAGES } from './recEmployerInfoConstants.js';

export { withConnection, packageStatusIsSuccess, MESSAGES };

/**
 * Normalize a validated employer-info GUID to uppercase 32-char hex (no hyphens).
 * @param {string} raw
 * @returns {string}
 */
export function compactEmployerInfoGuid(raw) {
  return String(raw).trim().replace(/-/g, '').toUpperCase();
}
