/**
 * Resolve enterprise from subdomain via ENT.ENT_ENTERPRISES_PKG.INVOKE
 * action RESOLVE_SUBDOMAIN.
 */

import { AppError } from '../../../../utils/errors/index.js';
import { getTenantConfig } from '../../../../utils/tenantConfig.js';
import {
  TENANT_ERROR_CODES,
  TENANT_ERROR_MESSAGES
} from '../../../../utils/tenantErrors.js';
import { entInvokeAction } from '../../shared/entModelBridge.js';

const MAX_CACHE_ENTRIES = 500;

/** @type {Map<string, { expiresAt: number, value: object|null, negative: boolean }>} */
const resolveCache = new Map();

/**
 * @param {string} subdomainSlug
 * @param {'MAIN'|'CAREER'} portalType
 */
function cacheKey(subdomainSlug, portalType) {
  return `${portalType}:${String(subdomainSlug).toLowerCase()}`;
}

function pruneCache(now = Date.now()) {
  for (const [key, entry] of resolveCache) {
    if (entry.expiresAt <= now) resolveCache.delete(key);
  }
  while (resolveCache.size > MAX_CACHE_ENTRIES) {
    const oldest = resolveCache.keys().next().value;
    if (oldest == null) break;
    resolveCache.delete(oldest);
  }
}

/**
 * @param {string} key
 * @param {object|null} value
 * @param {boolean} negative
 * @param {number} ttlMs
 */
function setCache(key, value, negative, ttlMs) {
  pruneCache();
  resolveCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
    negative
  });
}

/**
 * @param {unknown} data
 * @param {'MAIN'|'CAREER'} portalType
 */
export function shapeResolvedEnterprise(data, portalType) {
  const row = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const enterpriseId = Number(row.enterprise_id ?? row.ENTERPRISE_ID);
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    return null;
  }

  return Object.freeze({
    enterpriseId,
    enterpriseCode: String(row.enterprise_code ?? row.ENTERPRISE_CODE ?? ''),
    enterpriseName: String(row.enterprise_name ?? row.ENTERPRISE_NAME ?? ''),
    subdomainSlug: String(row.subdomain_slug ?? row.SUBDOMAIN_SLUG ?? '').toLowerCase(),
    isActive: String(row.is_active ?? row.IS_ACTIVE ?? 'Y').toUpperCase() === 'Y',
    careerPortalEnabled:
      String(row.career_portal_enabled_flag ?? row.CAREER_PORTAL_ENABLED_FLAG ?? 'N').toUpperCase() === 'Y',
    portalType: String(row.portal_type ?? portalType).toUpperCase() === 'CAREER' ? 'CAREER' : 'MAIN',
    mainApplicationUrl: row.main_application_url ?? row.MAIN_APPLICATION_URL ?? null,
    careerPortalUrl: row.career_portal_url ?? row.CAREER_PORTAL_URL ?? null
  });
}

/**
 * Map Oracle / package failures to public tenant errors (no internals).
 * @param {Error} err
 * @param {'MAIN'|'CAREER'} portalType
 */
function mapResolveFailure(err, portalType) {
  const msg = String(err?.message || '').toLowerCase();

  if (
    portalType === 'CAREER'
    && (/career.?portal/i.test(msg) || /portal.?unavailable/i.test(msg) || /not enabled/i.test(msg))
  ) {
    return new AppError(
      TENANT_ERROR_MESSAGES.CAREER_PORTAL_UNAVAILABLE,
      404,
      TENANT_ERROR_CODES.CAREER_PORTAL_UNAVAILABLE
    );
  }

  if (/not found|inactive|does not exist|unknown|no data/i.test(msg) || err?.code === 'ENT_API_ERROR') {
    return new AppError(
      TENANT_ERROR_MESSAGES.ENTERPRISE_NOT_FOUND,
      404,
      TENANT_ERROR_CODES.ENTERPRISE_NOT_FOUND
    );
  }

  return new AppError('An unexpected error occurred. Please try again later.', 500, 'INTERNAL_ERROR');
}

/**
 * @param {{ subdomainSlug: string, portalType?: 'MAIN'|'CAREER', skipCache?: boolean }} args
 */
export async function resolveEnterpriseBySubdomain({
  subdomainSlug,
  portalType,
  skipCache = false
}) {
  const cfg = getTenantConfig();
  const slug = String(subdomainSlug ?? '').trim().toLowerCase();
  const portal = (portalType || cfg.portalType) === 'CAREER' ? 'CAREER' : 'MAIN';

  if (!slug) {
    throw new AppError(
      TENANT_ERROR_MESSAGES.TENANT_REQUIRED,
      400,
      TENANT_ERROR_CODES.TENANT_REQUIRED
    );
  }

  const key = cacheKey(slug, portal);
  const now = Date.now();
  if (!skipCache) {
    const hit = resolveCache.get(key);
    if (hit && hit.expiresAt > now) {
      if (hit.negative) {
        throw new AppError(
          TENANT_ERROR_MESSAGES.ENTERPRISE_NOT_FOUND,
          404,
          TENANT_ERROR_CODES.ENTERPRISE_NOT_FOUND
        );
      }
      return hit.value;
    }
  }

  let data;
  try {
    data = await entInvokeAction('ENTERPRISES', 'RESOLVE_SUBDOMAIN', {
      subdomain_slug: slug,
      portal_type: portal
    });
  } catch (err) {
    if (err instanceof AppError && err.code !== 'ENT_API_ERROR') throw err;

    const mapped = mapResolveFailure(err, portal);
    if (
      mapped.code === TENANT_ERROR_CODES.ENTERPRISE_NOT_FOUND
      || mapped.code === TENANT_ERROR_CODES.CAREER_PORTAL_UNAVAILABLE
    ) {
      setCache(key, null, true, cfg.resolveNegativeCacheTtlMs);
    }
    throw mapped;
  }

  const shaped = shapeResolvedEnterprise(data, portal);
  if (!shaped || !shaped.isActive) {
    setCache(key, null, true, cfg.resolveNegativeCacheTtlMs);
    throw new AppError(
      TENANT_ERROR_MESSAGES.ENTERPRISE_NOT_FOUND,
      404,
      TENANT_ERROR_CODES.ENTERPRISE_NOT_FOUND
    );
  }

  if (portal === 'CAREER' && !shaped.careerPortalEnabled) {
    setCache(key, null, true, cfg.resolveNegativeCacheTtlMs);
    throw new AppError(
      TENANT_ERROR_MESSAGES.CAREER_PORTAL_UNAVAILABLE,
      404,
      TENANT_ERROR_CODES.CAREER_PORTAL_UNAVAILABLE
    );
  }

  setCache(key, shaped, false, cfg.resolveCacheTtlMs);
  return shaped;
}

/** Invalidate cached resolutions (call after enterprise create/update/delete). */
export function clearEnterpriseResolveCache() {
  resolveCache.clear();
}

/**
 * Drop cache entries for a specific subdomain slug (both portal types).
 * @param {string|null|undefined} subdomainSlug
 */
export function invalidateEnterpriseResolveCacheForSlug(subdomainSlug) {
  const slug = String(subdomainSlug ?? '').trim().toLowerCase();
  if (!slug) {
    clearEnterpriseResolveCache();
    return;
  }
  resolveCache.delete(cacheKey(slug, 'MAIN'));
  resolveCache.delete(cacheKey(slug, 'CAREER'));
}
