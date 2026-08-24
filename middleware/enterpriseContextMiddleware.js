/**
 * Resolve enterprise context from request hostname.
 *
 * Attaches immutable `req.enterprise` when a tenant slug is present.
 * Base domains leave `req.enterprise` null (migration-compatible).
 *
 * Paths that manage tenants themselves (e.g. /api/enterprises) skip Oracle
 * resolution so create/update is not blocked by DEV_ENTERPRISE_SLUG / cache.
 */

import { AppError } from '../utils/errors/index.js';
import { getTenantConfig } from '../utils/tenantConfig.js';
import {
  extractTenantFromHostname,
  getEffectiveHostname
} from '../utils/tenantHostname.js';
import {
  TENANT_ERROR_CODES,
  TENANT_ERROR_MESSAGES,
  isTenantErrorCode,
  sendTenantError
} from '../utils/tenantErrors.js';
import { getRequestId, logTenantResolution } from '../utils/tenantLogger.js';
import { resolveEnterpriseBySubdomain } from '../feature/enterprise_structure/enterprises/service/resolveEnterpriseBySubdomain.js';

/** Routes that must not call RESOLVE_SUBDOMAIN. */
const SKIP_RESOLVE_PATHS = [
  /^\/health\/?$/,
  /^\/api\/enterprises(\/.*)?\/?$/
];

function requestPathname(req) {
  const raw = req.path || req.originalUrl || req.url || '';
  return String(raw).split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';
}

function shouldSkipResolve(req) {
  const path = requestPathname(req);
  return SKIP_RESOLVE_PATHS.some((re) => re.test(path));
}

/**
 * @param {import('express').Request} req
 * @param {object|null} enterprise
 */
function attachEnterprise(req, enterprise) {
  if (enterprise == null) {
    req.enterprise = null;
    return;
  }
  req.enterprise = Object.freeze({
    enterpriseId: enterprise.enterpriseId,
    enterpriseCode: enterprise.enterpriseCode,
    enterpriseName: enterprise.enterpriseName,
    currencyCode: enterprise.currencyCode ?? null,
    subdomainSlug: enterprise.subdomainSlug,
    portalType: enterprise.portalType,
    mainApplicationUrl: enterprise.mainApplicationUrl,
    careerPortalUrl: enterprise.careerPortalUrl
  });
}

function logResolve(fields) {
  logTenantResolution(fields);
}

/**
 * Global middleware: resolve tenant from hostname when applicable.
 * Does not fail on base domain (no slug).
 */
export async function resolveEnterpriseContext(req, res, next) {
  const cfg = getTenantConfig();
  const hostname = getEffectiveHostname(req);
  const extracted = extractTenantFromHostname(hostname, cfg);
  const route = `${req.method} ${req.originalUrl || req.url || ''}`;
  const requestId = getRequestId(req);

  req.tenantHost = Object.freeze({
    hostname: extracted.hostname,
    kind: extracted.kind,
    subdomainSlug: extracted.subdomainSlug,
    matchedBaseDomain: extracted.matchedBaseDomain,
    inferredPortalType: extracted.inferredPortalType
  });

  if (shouldSkipResolve(req)) {
    attachEnterprise(req, null);
    return next();
  }

  try {
    if (extracted.kind === 'invalid') {
      logResolve({
        requestId,
        hostname: extracted.hostname,
        subdomainSlug: null,
        portalType: cfg.portalType,
        result: 'INVALID_TENANT_HOST',
        route,
        httpStatus: 400
      });
      return sendTenantError(
        res,
        400,
        TENANT_ERROR_CODES.INVALID_TENANT_HOST,
        TENANT_ERROR_MESSAGES.INVALID_TENANT_HOST
      );
    }

    if (extracted.kind === 'base' || extracted.kind === 'unmatched') {
      attachEnterprise(req, null);
      return next();
    }

    const portalType = (extracted.inferredPortalType || cfg.portalType) === 'CAREER'
      ? 'CAREER'
      : 'MAIN';
    const effectivePortal = cfg.portalType === 'CAREER' ? 'CAREER' : portalType;

    const enterprise = await resolveEnterpriseBySubdomain({
      subdomainSlug: extracted.subdomainSlug,
      portalType: effectivePortal
    });

    attachEnterprise(req, enterprise);

    logResolve({
      requestId,
      hostname: extracted.hostname,
      subdomainSlug: extracted.subdomainSlug,
      portalType: effectivePortal,
      enterpriseId: enterprise.enterpriseId,
      result: 'RESOLVED',
      route,
      httpStatus: null
    });

    return next();
  } catch (err) {
    if (err instanceof AppError && isTenantErrorCode(err.code)) {
      logResolve({
        requestId,
        hostname: extracted.hostname,
        subdomainSlug: extracted.subdomainSlug,
        portalType: cfg.portalType,
        result: err.code,
        route,
        httpStatus: err.statusCode
      });
      return sendTenantError(res, err.statusCode, err.code, err.message);
    }
    logResolve({
      requestId,
      hostname: extracted.hostname,
      subdomainSlug: extracted.subdomainSlug,
      portalType: cfg.portalType,
      result: 'ERROR',
      route,
      httpStatus: 500
    });
    return sendTenantError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again later.');
  }
}

/**
 * Require req.enterprise (hostname tenant). Use on public tenant endpoints.
 */
export function requireEnterpriseContext(req, res, next) {
  if (req.enterprise?.enterpriseId) return next();
  logResolve({
    requestId: getRequestId(req),
    hostname: req.tenantHost?.hostname,
    subdomainSlug: req.tenantHost?.subdomainSlug,
    portalType: getTenantConfig().portalType,
    result: 'TENANT_REQUIRED',
    route: `${req.method} ${req.originalUrl || req.url || ''}`,
    httpStatus: 400
  });
  return sendTenantError(
    res,
    400,
    TENANT_ERROR_CODES.TENANT_REQUIRED,
    TENANT_ERROR_MESSAGES.TENANT_REQUIRED
  );
}

/**
 * After JWT auth: reject when token enterprise ≠ hostname enterprise.
 */
export function enforceJwtEnterpriseMatch(req, res, next) {
  const hostId = req.enterprise?.enterpriseId;
  if (hostId == null) return next();

  const tokenId = req.user?.enterprise_id ?? req.user?.enterpriseId;
  if (tokenId == null || tokenId === '') return next();

  const n = Number(tokenId);
  if (!Number.isFinite(n) || n < 1) return next();

  if (n !== Number(hostId)) {
    logResolve({
      requestId: getRequestId(req),
      hostname: req.tenantHost?.hostname,
      subdomainSlug: req.tenantHost?.subdomainSlug,
      portalType: req.enterprise?.portalType,
      enterpriseId: hostId,
      result: 'ENTERPRISE_CONTEXT_MISMATCH',
      route: `${req.method} ${req.originalUrl || req.url || ''}`,
      httpStatus: 403
    });
    return sendTenantError(
      res,
      403,
      TENANT_ERROR_CODES.ENTERPRISE_CONTEXT_MISMATCH,
      TENANT_ERROR_MESSAGES.ENTERPRISE_CONTEXT_MISMATCH
    );
  }
  return next();
}
