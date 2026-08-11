import { DatabaseError } from '../../../../utils/errors/index.js';

/**
 * Strip Oracle application-error prefixes (e.g. "ORA-20013: ") and stack lines.
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function extractOracleApplicationMessage(oracleError) {
  if (!oracleError) return null;
  const message = String(oracleError.message ?? '').trim();
  if (!message) return null;

  const appLine = message.match(/ORA-20\d{3}:\s*([^\n\r]+)/i);
  if (appLine?.[1]) return String(appLine[1]).trim();

  const firstLine = message.split(/\n/)[0].trim();
  const stripped = firstLine.replace(/^ORA-\d+:\s*/i, '').trim();
  return stripped || null;
}

/**
 * Map Oracle errors to HTTP status for this feature.
 * @param {unknown} oracleError
 * @param {string|null} [userMessage]
 * @returns {number}
 */
export function resolveMappingHttpStatus(oracleError, userMessage = null) {
  const msg = String(userMessage || oracleError?.message || '').toLowerCase();
  const errorNum = Number(oracleError?.errorNum);

  if (msg.includes('already mapped') || msg.includes('already exists')) return 409;
  if (msg.includes('not found')) return 404;

  if (Number.isFinite(errorNum)) {
    if (errorNum === 1) return 409;
    if (errorNum === 1403) return 404;
    if (errorNum >= 20000 && errorNum <= 20999) {
      if (msg.includes('already')) return 409;
      if (msg.includes('not found')) return 404;
      return 400;
    }
  }

  const fromDb = DatabaseError.getStatusCode(oracleError);
  if (fromDb === 409 || fromDb === 404 || fromDb === 400) return fromDb;
  return 500;
}

/**
 * @param {unknown} oracleError
 * @param {string} [fallback]
 * @returns {string}
 */
export function resolveMappingUserMessage(
  oracleError,
  fallback = 'Unable to process component payroll mapping. Please try again.'
) {
  const extracted = extractOracleApplicationMessage(oracleError);
  if (extracted) return extracted;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return String(shared).replace(/^ORA-\d+:\s*/i, '').trim();
    }
  }

  return fallback;
}
