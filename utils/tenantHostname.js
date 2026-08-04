/**
 * Hostname → tenant slug extraction for DigifyHR multi-tenant hosts.
 *
 * Main:    {tenant}.app.digifyhr.com
 * Career:  {tenant}.careers.digifyhr.com
 * Local:   {tenant}.localhost  | localhost (+ DEV_ENTERPRISE_SLUG)
 */

import { IS_PROD_MODE } from './env.js';
import { getTenantConfig } from './tenantConfig.js';

/** RFC-ish DNS label used as tenant slug (lowercase). */
export const TENANT_SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * @param {unknown} hostHeader
 * @returns {string}
 */
export function normalizeHostname(hostHeader) {
  let host = String(hostHeader ?? '').trim().toLowerCase();
  if (!host) return '';
  // First value when X-Forwarded-Host is a comma-separated list
  if (host.includes(',')) {
    host = host.split(',')[0].trim().toLowerCase();
  }
  while (host.endsWith('.')) {
    host = host.slice(0, -1);
  }
  // Strip port (IPv6 [::1]:3000 handled loosely — Digify uses DNS names)
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end !== -1) {
      const rest = host.slice(end + 1);
      host = host.slice(1, end);
      if (rest.startsWith(':') && /^\d+$/.test(rest.slice(1))) {
        // port discarded
      }
    }
  } else {
    const colon = host.lastIndexOf(':');
    if (colon > -1 && /^\d+$/.test(host.slice(colon + 1))) {
      host = host.slice(0, colon);
    }
  }
  return host;
}

/**
 * Effective hostname: prefer X-Forwarded-Host only when trust proxy is enabled.
 * @param {import('express').Request} req
 * @param {{ trustProxy?: boolean|number|string }} [options]
 */
export function getEffectiveHostname(req, options = {}) {
  const cfg = getTenantConfig();
  const trustProxy = options.trustProxy !== undefined ? options.trustProxy : cfg.trustProxy;
  const trustEnabled = trustProxy === true || trustProxy === 1
    || (typeof trustProxy === 'number' && trustProxy > 0)
    || (typeof trustProxy === 'string' && trustProxy.length > 0 && trustProxy !== 'false');

  if (trustEnabled) {
    const xf = req.headers?.['x-forwarded-host'];
    if (xf != null && String(xf).trim() !== '') {
      return normalizeHostname(xf);
    }
  }

  // Express populates req.hostname when trust proxy is set; still normalize.
  if (req.hostname) {
    return normalizeHostname(req.hostname);
  }

  return normalizeHostname(req.headers?.host);
}

/**
 * @param {string} hostname
 * @param {string} baseDomain
 * @returns {'base'|'tenant'|'malformed'|'none'}
 */
function matchAgainstBase(hostname, baseDomain) {
  const base = normalizeHostname(baseDomain);
  if (!base || !hostname) return 'none';
  if (hostname === base) return 'base';
  if (!hostname.endsWith(`.${base}`)) return 'none';
  const prefix = hostname.slice(0, -(base.length + 1));
  if (!prefix || prefix.includes('.')) return 'malformed';
  if (!TENANT_SLUG_RE.test(prefix)) return 'malformed';
  return 'tenant';
}

/**
 * Extract tenant slug from a hostname for the configured portal domains.
 *
 * @param {string} hostname
 * @param {{
 *   mainAppBaseDomain?: string,
 *   careerPortalBaseDomain?: string,
 *   portalType?: 'MAIN'|'CAREER',
 *   devEnterpriseSlug?: string|null
 * }} [config]
 * @returns {{
 *   kind: 'tenant'|'base'|'dev_fallback'|'invalid'|'unmatched',
 *   subdomainSlug: string|null,
 *   matchedBaseDomain: string|null,
 *   inferredPortalType: 'MAIN'|'CAREER'|null,
 *   hostname: string
 * }}
 */
export function extractTenantFromHostname(hostname, config = {}) {
  const cfg = { ...getTenantConfig(), ...config };
  const host = normalizeHostname(hostname);

  if (!host) {
    return {
      kind: 'invalid',
      subdomainSlug: null,
      matchedBaseDomain: null,
      inferredPortalType: null,
      hostname: host
    };
  }

  const mainBase = normalizeHostname(cfg.mainAppBaseDomain);
  const careerBase = normalizeHostname(cfg.careerPortalBaseDomain);

  const mainMatch = matchAgainstBase(host, mainBase);
  if (mainMatch === 'base') {
    return {
      kind: 'base',
      subdomainSlug: null,
      matchedBaseDomain: mainBase,
      inferredPortalType: 'MAIN',
      hostname: host
    };
  }
  if (mainMatch === 'malformed') {
    return {
      kind: 'invalid',
      subdomainSlug: null,
      matchedBaseDomain: mainBase,
      inferredPortalType: 'MAIN',
      hostname: host
    };
  }
  if (mainMatch === 'tenant') {
    const slug = host.slice(0, -(mainBase.length + 1));
    return {
      kind: 'tenant',
      subdomainSlug: slug,
      matchedBaseDomain: mainBase,
      inferredPortalType: 'MAIN',
      hostname: host
    };
  }

  const careerMatch = matchAgainstBase(host, careerBase);
  if (careerMatch === 'base') {
    return {
      kind: 'base',
      subdomainSlug: null,
      matchedBaseDomain: careerBase,
      inferredPortalType: 'CAREER',
      hostname: host
    };
  }
  if (careerMatch === 'malformed') {
    return {
      kind: 'invalid',
      subdomainSlug: null,
      matchedBaseDomain: careerBase,
      inferredPortalType: 'CAREER',
      hostname: host
    };
  }
  if (careerMatch === 'tenant') {
    const slug = host.slice(0, -(careerBase.length + 1));
    return {
      kind: 'tenant',
      subdomainSlug: slug,
      matchedBaseDomain: careerBase,
      inferredPortalType: 'CAREER',
      hostname: host
    };
  }

  // Local development hosts
  if (!IS_PROD_MODE) {
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      const slug = cfg.devEnterpriseSlug && TENANT_SLUG_RE.test(cfg.devEnterpriseSlug)
        ? cfg.devEnterpriseSlug.toLowerCase()
        : null;
      if (slug) {
        return {
          kind: 'dev_fallback',
          subdomainSlug: slug,
          matchedBaseDomain: 'localhost',
          inferredPortalType: cfg.portalType,
          hostname: host
        };
      }
      return {
        kind: 'base',
        subdomainSlug: null,
        matchedBaseDomain: 'localhost',
        inferredPortalType: cfg.portalType,
        hostname: host
      };
    }

    if (host.endsWith('.localhost')) {
      const slug = host.slice(0, -('.localhost'.length));
      if (!slug || slug.includes('.') || !TENANT_SLUG_RE.test(slug)) {
        return {
          kind: 'invalid',
          subdomainSlug: null,
          matchedBaseDomain: 'localhost',
          inferredPortalType: cfg.portalType,
          hostname: host
        };
      }
      return {
        kind: 'tenant',
        subdomainSlug: slug,
        matchedBaseDomain: 'localhost',
        inferredPortalType: cfg.portalType,
        hostname: host
      };
    }
  }

  return {
    kind: 'unmatched',
    subdomainSlug: null,
    matchedBaseDomain: null,
    inferredPortalType: null,
    hostname: host
  };
}
