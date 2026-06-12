/**
 * Shared request helpers (user id, audit actor, etc.).
 */

/**
 * Normalize a user id for Oracle VARCHAR2 audit columns (CREATED_BY, LAST_UPDATED_BY).
 * JWT `user_id` is numeric; executeMany bindDefs with STRING type require a string value (NJS-011).
 *
 * @param {unknown} userId
 * @returns {string}
 */
export function toAuditActorId(userId) {
  if (userId == null) return 'SYSTEM';
  const s = String(userId).trim();
  return s !== '' ? s : 'SYSTEM';
}

/**
 * Get acting user ID from request (header or JWT user context).
 * Always returns a string suitable for audit columns and explicit STRING binds.
 *
 * @param {object} req - Express request
 * @returns {string}
 */
export function getUserId(req) {
  const raw =
    req.headers?.['x-user-id'] ??
    req.user?.id ??
    req.user?.user_id ??
    'SYSTEM';
  return toAuditActorId(raw);
}
