/**
 * JWT Authentication Middleware
 *
 * Verifies the `Authorization: Bearer <token>` header on every request and
 * populates `req.user` with the decoded JWT payload. The token is issued by
 * POST /api/security/auth/login (see FNDSEC.FNDSEC_AUTH_PKG.LOGIN_USER) and
 * contains: { user_id, user_guid, enterprise_id, username }.
 * Candidate portal tokens may also include `candidate_guid`.
 *
 * Public endpoints (no token required) are configured via PUBLIC_PATHS below.
 *
 * The middleware always:
 *   - Sets `req.user.user_id`, `req.user.id` (alias), `req.user.user_guid`,
 *     `req.user.enterprise_id`, `req.user.username`, and optional `candidate_guid`.
 *   - Returns 401 with a user-friendly message when the token is missing,
 *     malformed, or expired (for required auth).
 *   - Does not expose raw library/Oracle errors to the client.
 */

import jwt from 'jsonwebtoken';
import { isHex32 } from '../utils/guidUtils.js';

const PUBLIC_PATHS = [
  { method: 'GET', pattern: /^\/health\/?$/ },
  { method: 'POST', pattern: /^\/api\/security\/auth\/login\/?$/ },
  // Career portal — token-free (register, login, apply-related public flows)
  { method: '*', pattern: /^\/api\/candidate(\/.*)?\/?$/ },
  { method: '*', pattern: /^\/candidate(\/.*)?\/?$/ },
  { method: 'GET', pattern: /^\/api\/rec\/job-postings\/?$/ },
  { method: 'GET', pattern: /^\/api\/rec\/job-postings\/[^/]+\/?$/ },
  { method: 'POST', pattern: /^\/api\/rec\/job-postings\/[^/]+\/apply\/?$/ },
  // Career portal — candidate job offer response (no JWT)
  { method: 'POST', pattern: /^\/api\/rec\/job-offers\/[^/]+\/accept\/?$/ },
  { method: 'POST', pattern: /^\/api\/rec\/job-offers\/[^/]+\/decline\/?$/ },
  { method: 'GET', pattern: /^\/api\/rec\/job-offers\/[^/]+\/pdf\/?$/ },
  // Public document download by GUID (deep-linkable URLs).
  { method: 'GET', pattern: /^\/documents\/[^/]+\/download\/?$/ },
  // GRC — no JWT required for now
  { method: '*', pattern: /^\/api\/grc(\/.*)?\/?$/ }
];

function requestPathname(req) {
  const raw = req.path || req.originalUrl || req.url || '';
  const withoutQuery = String(raw).split('?')[0].split('#')[0];
  return withoutQuery.replace(/\/+$/, '') || '/';
}

function isPublicRequest(req) {
  if (req.method === 'OPTIONS') return true;
  const path = requestPathname(req);
  return PUBLIC_PATHS.some(
    (p) => (p.method === '*' || p.method === req.method) && p.pattern.test(path)
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

function sendAuthConfigError(res) {
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

function mapJwtVerifyError(err) {
  if (err?.name === 'TokenExpiredError') {
    return {
      message: 'Your session has expired. Please sign in again.',
      code: 'TOKEN_EXPIRED'
    };
  }
  if (err?.name === 'JsonWebTokenError') {
    return { message: 'Invalid authentication token', code: 'TOKEN_INVALID' };
  }
  return { message: 'Authentication failed', code: 'AUTH_ERROR' };
}

function verifyTokenPayload(token, secret) {
  const payload = jwt.verify(token, secret);
  if (!payload || typeof payload !== 'object') {
    const err = new Error('Invalid authentication token');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return payload;
}

function normalizeCandidateGuidFromPayload(raw) {
  if (raw == null || raw === '') return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (!isHex32(trimmed)) return trimmed;
  return trimmed.replace(/-/g, '').toLowerCase();
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
    candidate_guid: normalizeCandidateGuidFromPayload(
      payload.candidate_guid ?? payload.candidateGuid ?? null
    ),
    enterprise_id: payload.enterprise_id ?? payload.enterpriseId ?? null,
    admin_type: payload.admin_type ?? payload.adminType ?? null,
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
  if (!secret) return sendAuthConfigError(res);

  const token = extractBearerToken(req);
  if (!token) {
    return sendUnauthorized(res, 'Authentication token is required', 'TOKEN_MISSING');
  }

  try {
    attachUserFromPayload(req, verifyTokenPayload(token, secret));
    return next();
  } catch (err) {
    const mapped = mapJwtVerifyError(err);
    return sendUnauthorized(res, mapped.message, mapped.code);
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
    attachUserFromPayload(req, verifyTokenPayload(token, secret));
  } catch (_) {
    // ignore invalid tokens in optional mode
  }
  return next();
}

/**
 * Optional authentication for public endpoints that enrich responses when a
 * candidate (or other user) is logged in.
 *
 * - No Authorization header → `req.user = null`, continue
 * - Valid Bearer token → populate `req.user` (including `candidate_guid`)
 * - Token present but invalid/expired → 401
 */
export function optionalAuthenticateToken(req, res, next) {
  req.user = null;

  const token = extractBearerToken(req);
  if (!token) return next();

  const secret = resolveJwtSecret();
  if (!secret) return sendAuthConfigError(res);

  try {
    attachUserFromPayload(req, verifyTokenPayload(token, secret));
    return next();
  } catch (err) {
    const mapped = mapJwtVerifyError(err);
    return sendUnauthorized(res, mapped.message, mapped.code);
  }
}
