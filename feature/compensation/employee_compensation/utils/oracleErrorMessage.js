import { DatabaseError } from '../../../../utils/errors/index.js';

/**
 * First-line Oracle client error text (used after rollback / rethrow).
 * @param {unknown} error
 * @returns {string}
 */
export function getOracleErrorMessage(error) {
  if (!error) return 'Unknown Oracle error';
  return error.message || String(error);
}

const ORA_OR_DRIVER_CODE = /\b(?:ORA-\d{5}|NJS-\d+|DPI-\d+)\b/i;

/**
 * User-facing API copy: map Oracle errors, then strip any remaining ORA/NJS/DPI tokens.
 * @param {unknown} error
 * @param {string} [fallback] — when the friendly message still contains driver codes
 * @returns {string}
 */
export function safeDatabaseMessageForApi(
  error,
  fallback = 'Unable to fetch compensation history. Please try again later.'
) {
  const m = DatabaseError.getUserFriendlyMessage(error);
  if (ORA_OR_DRIVER_CODE.test(m)) return fallback;
  return m;
}
