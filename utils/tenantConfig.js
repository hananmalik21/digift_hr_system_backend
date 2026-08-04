/**
 * Tenant / portal hostname configuration from environment.
 * Do not hardcode production domain names elsewhere.
 */

import { IS_PROD_MODE } from './env.js';

function trimEnv(name, fallback = '') {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return fallback;
  return String(raw).trim();
}

/**
 * @returns {{
 *   mainAppBaseDomain: string,
 *   careerPortalBaseDomain: string,
 *   portalType: 'MAIN'|'CAREER',
 *   devEnterpriseSlug: string|null,
 *   trustProxy: boolean|number|string,
 *   resolveCacheTtlMs: number,
 *   resolveNegativeCacheTtlMs: number
 * }}
 */
export function getTenantConfig() {
  const portalRaw = trimEnv('PORTAL_TYPE', 'MAIN').toUpperCase();
  const portalType = portalRaw === 'CAREER' ? 'CAREER' : 'MAIN';

  const trustRaw = trimEnv('TRUST_PROXY', '');
  let trustProxy = false;
  if (trustRaw === 'true' || trustRaw === '1') trustProxy = 1;
  else if (trustRaw === 'false' || trustRaw === '0' || trustRaw === '') trustProxy = false;
  else if (/^\d+$/.test(trustRaw)) trustProxy = Number(trustRaw);
  else trustProxy = trustRaw; // e.g. subnet / IP list string for Express

  const positiveTtl = Number(trimEnv('TENANT_RESOLVE_CACHE_TTL_MS', '240000'));
  const negativeTtl = Number(trimEnv('TENANT_RESOLVE_NEGATIVE_CACHE_TTL_MS', '45000'));

  return {
    mainAppBaseDomain: trimEnv('MAIN_APP_BASE_DOMAIN', 'app.digifyhr.com').toLowerCase(),
    careerPortalBaseDomain: trimEnv('CAREER_PORTAL_BASE_DOMAIN', 'careers.digifyhr.com').toLowerCase(),
    portalType,
    /** Development-only fallback slug; never used in production. */
    devEnterpriseSlug: IS_PROD_MODE ? null : (trimEnv('DEV_ENTERPRISE_SLUG') || null),
    trustProxy,
    resolveCacheTtlMs: Number.isFinite(positiveTtl) && positiveTtl > 0 ? positiveTtl : 240000,
    resolveNegativeCacheTtlMs:
      Number.isFinite(negativeTtl) && negativeTtl > 0 ? Math.min(negativeTtl, 60000) : 45000
  };
}

export function resolveExpressTrustProxy() {
  return getTenantConfig().trustProxy;
}
