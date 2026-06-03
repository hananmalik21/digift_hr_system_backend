/**
 * JWT Authentication Middleware
 *
 * Verifies the `Authorization: Bearer <token>` header on every request and
 * populates `req.user` with the decoded JWT payload. The token is issued by
 * POST /api/security/auth/login (see FNDSEC.FNDSEC_AUTH_PKG.LOGIN_USER) and
 * contains: { user_id, user_guid, enterprise_id, username }.
 *
 * Public endpoints (no token required) are configured via PUBLIC_PATHS below.
 *
 * The middleware always:
 *   - Sets `req.user.user_id`, `req.user.id` (alias), `req.user.user_guid`,
 *     `req.user.enterprise_id`, `req.user.username`.
 *   - Returns 401 with a user-friendly message when the token is missing,
 *     malformed, or expired.
 *   - Does not expose raw library/Oracle errors to the client.
 */

import jwt from 'jsonwebtoken';

const PUBLIC_PATHS = [
  { method: 'GET', pattern: /^\/health\/?$/ },
  { method: 'POST', pattern: /^\/api\/security\/auth\/login\/?$/ },
  { method: 'POST', pattern: /^\/candidate\/register\/?$/ },
  { method: 'POST', pattern: /^\/candidate\/login\/?$/ },
  // Job posting reads only (no JWT); POST/PUT and other mutations require JWT.
  { method: 'GET', pattern: /^\/api\/rec\/job-postings\/?$/ },
  { method: 'GET', pattern: /^\/api\/rec\/job-postings\/[^/]+\/?$/ },
  // Public document download by GUID (deep-linkable URLs).
  { method: 'GET', pattern: /^\/documents\/[^/]+\/download\/?$/ }
];

function isPublicRequest(req) {
  if (req.method === 'OPTIONS') return true;
  const path = req.path || req.url || '';
  return PUBLIC_PATHS.some(p =>
    (p.method === '*' || p.method === req.method) && p.pattern.test(path)
  );
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim().length < 16) return null;
  return String(secret);
}

function extractBearerToken(req) {
  const auth = req.headers?.authorization ?? req.headers?.Authorization;
  if (!auth || typeof auth !== 'string') return null;
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function sendUnauthorized(res, message, code) {
  return res.status(401).json({
    success: false,
    message: message || 'Authentication required',
    error_details: {
      message: message || 'Authentication required',
      code: code || 'UNAUTHENTICATED',
      type: 'AuthError'
    }
  });
}

function attachUserFromPayload(req, payload) {
  const userIdRaw = payload.user_id ?? payload.userId ?? payload.id ?? null;
  const userId = userIdRaw != null && userIdRaw !== '' && Number.isFinite(Number(userIdRaw))
    ? Number(userIdRaw)
    : userIdRaw;

  req.user = {
    user_id: userId,
    id: userId,
    user_guid: payload.user_guid ?? payload.userGuid ?? null,
    enterprise_id: payload.enterprise_id ?? payload.enterpriseId ?? null,
    username: payload.username ?? payload.userName ?? null,
    iat: payload.iat,
    exp: payload.exp
  };
}

/**
 * Global authentication middleware. Reject requests that don't carry a valid
 * `Authorization: Bearer <token>` header unless the path is in PUBLIC_PATHS.
 */
export function requireAuth(req, res, next) {
  if (isPublicRequest(req)) return next();

  const secret = resolveJwtSecret();
  if (!secret) {
    return res.status(500).json({
      success: false,
      message: 'Server authentication is not configured',
      error_details: {
        message: 'JWT_SECRET is missing or too short',
        code: 'AUTH_CONFIG_ERROR',
        type: 'AuthError'
      }
    });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return sendUnauthorized(res, 'Authentication token is required', 'TOKEN_MISSING');
  }

  try {
    const payload = jwt.verify(token, secret);
    if (!payload || typeof payload !== 'object') {
      return sendUnauthorized(res, 'Invalid authentication token', 'TOKEN_INVALID');
    }
    attachUserFromPayload(req, payload);
    return next();
  } catch (err) {
    if (err && err.name === 'TokenExpiredError') {
      return sendUnauthorized(res, 'Your session has expired. Please sign in again.', 'TOKEN_EXPIRED');
    }
    if (err && err.name === 'JsonWebTokenError') {
      return sendUnauthorized(res, 'Invalid authentication token', 'TOKEN_INVALID');
    }
    return sendUnauthorized(res, 'Authentication failed', 'AUTH_ERROR');
  }
}

/**
 * Optional authentication: populates `req.user` when a valid token is sent,
 * but never blocks the request. Useful for routes that should be reachable
 * anonymously while still benefiting from user context when available.
 */
export function optionalAuth(req, _res, next) {
  const secret = resolveJwtSecret();
  const token = extractBearerToken(req);
  if (!secret || !token) return next();

  try {
    const payload = jwt.verify(token, secret);
    if (payload && typeof payload === 'object') {
      attachUserFromPayload(req, payload);
    }
  } catch (_) {
    // ignore invalid tokens in optional mode
  }
  return next();
}
