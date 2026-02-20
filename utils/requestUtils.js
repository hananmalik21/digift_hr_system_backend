/**
 * Shared request helpers (user id, etc.).
 */

/**
 * Get acting user ID from request (header or user context).
 * @param {object} req - Express request
 * @returns {string} User ID or 'SYSTEM'
 */
export function getUserId(req) {
  return req.headers['x-user-id'] || req.user?.id || 'SYSTEM';
}
