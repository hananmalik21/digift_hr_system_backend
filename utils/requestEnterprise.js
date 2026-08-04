/**
 * Prefer hostname-resolved enterprise ID over client-supplied values.
 */

import { AppError, ValidationError } from './errors/index.js';
import {
  TENANT_ERROR_CODES,
  TENANT_ERROR_MESSAGES
} from './tenantErrors.js';
import { logDeprecatedEnterpriseId } from './tenantLogger.js';

/**
 * @param {unknown} raw
 * @returns {number}
 */
function parsePositiveEnterpriseId(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('enterprise_id is required');
  }
  const enterpriseId = parseInt(String(raw), 10);
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    throw new ValidationError('enterprise_id must be a valid positive number');
  }
  return enterpriseId;
}

/**
 * @param {unknown} clientRaw
 * @param {number} resolvedId
 * @param {string} fieldLabel
 * @param {import('express').Request} [req]
 */
function assertClientMatchesResolved(clientRaw, resolvedId, fieldLabel, req) {
  const clientPresent = clientRaw !== undefined && clientRaw !== null && String(clientRaw).trim() !== '';
  if (!clientPresent) return;

  try {
    const clientId = parsePositiveEnterpriseId(clientRaw);
    if (clientId !== resolvedId) {
      throw new AppError(
        TENANT_ERROR_MESSAGES.ENTERPRISE_CONTEXT_MISMATCH,
        403,
        TENANT_ERROR_CODES.ENTERPRISE_CONTEXT_MISMATCH
      );
    }
    logDeprecatedEnterpriseId(fieldLabel, clientRaw, resolvedId, req);
  } catch (err) {
    if (err instanceof AppError && err.code === TENANT_ERROR_CODES.ENTERPRISE_CONTEXT_MISMATCH) {
      throw err;
    }
    // Invalid client value while a trusted id is resolved — ignore client
    logDeprecatedEnterpriseId(fieldLabel, clientRaw, resolvedId, req);
  }
}

/**
 * @param {import('express').Request} req
 * @returns {number|null}
 */
export function getHostnameEnterpriseId(req) {
  const id = req?.enterprise?.enterpriseId;
  if (id == null || id === '') return null;
  const n = Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Whether the request was served from a tenant-specific hostname (or dev slug).
 * @param {import('express').Request} req
 */
export function hasHostnameEnterprise(req) {
  return getHostnameEnterpriseId(req) != null;
}

/**
 * Resolve enterprise_id for tenant-scoped work.
 *
 * Priority:
 *   1. req.enterprise.enterpriseId (hostname)
 *   2. JWT enterprise_id when on base domain (migration)
 *   3. Deprecated client value when on base domain only
 *
 * When hostname is present, conflicting client enterprise_id is rejected.
 *
 * @param {import('express').Request} req
 * @param {{
 *   clientRaw?: unknown,
 *   required?: boolean,
 *   allowJwtFallback?: boolean,
 *   allowClientFallback?: boolean,
 *   fieldLabel?: string
 * }} [options]
 * @returns {number|null}
 */
export function resolveRequestEnterpriseId(req, options = {}) {
  const {
    clientRaw,
    required = true,
    allowJwtFallback = true,
    allowClientFallback = true,
    fieldLabel = 'enterprise_id'
  } = options;

  const hostId = getHostnameEnterpriseId(req);
  if (hostId != null) {
    assertClientMatchesResolved(clientRaw, hostId, fieldLabel, req);
    return hostId;
  }

  if (allowJwtFallback) {
    const jwtId = Number(req?.user?.enterprise_id ?? req?.user?.enterpriseId);
    if (Number.isFinite(jwtId) && jwtId > 0) {
      assertClientMatchesResolved(clientRaw, jwtId, fieldLabel, req);
      return jwtId;
    }
  }

  const clientPresent = clientRaw !== undefined && clientRaw !== null && String(clientRaw).trim() !== '';
  if (allowClientFallback && clientPresent) {
    const id = parsePositiveEnterpriseId(clientRaw);
    logDeprecatedEnterpriseId(fieldLabel, clientRaw, id, req);
    return id;
  }

  if (required) {
    throw new AppError(
      TENANT_ERROR_MESSAGES.TENANT_REQUIRED,
      400,
      TENANT_ERROR_CODES.TENANT_REQUIRED
    );
  }
  return null;
}

/**
 * Require hostname-resolved enterprise (no base-domain client fallback).
 * Use for public career portal + public enterprise-context.
 *
 * @param {import('express').Request} req
 * @returns {number}
 */
export function requireHostnameEnterpriseId(req) {
  const id = getHostnameEnterpriseId(req);
  if (id != null) return id;
  throw new AppError(
    TENANT_ERROR_MESSAGES.TENANT_REQUIRED,
    400,
    TENANT_ERROR_CODES.TENANT_REQUIRED
  );
}

/**
 * Inject resolved enterprise_id into a query object for legacy filter builders.
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} [query]
 * @param {{ requireHostname?: boolean }} [options]
 */
export function withResolvedEnterpriseQuery(req, query, options = {}) {
  const q = { ...(query ?? req.query ?? {}) };
  const id = options.requireHostname
    ? requireHostnameEnterpriseId(req)
    : resolveRequestEnterpriseId(req, {
      clientRaw: q.enterprise_id ?? q.tenant_id,
      required: true
    });
  q.enterprise_id = id;
  return q;
}

/**
 * Inject resolved enterprise_id into a body object for portal mutations.
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} body
 * @param {{ requireHostname?: boolean }} [options]
 */
export function withResolvedEnterpriseBody(req, body, options = {}) {
  const b = { ...(body || {}) };
  const clientRaw = b.enterprise_id ?? b.ENTERPRISE_ID;
  const id = options.requireHostname
    ? requireHostnameEnterpriseId(req)
    : resolveRequestEnterpriseId(req, {
      clientRaw,
      required: true
    });
  if (clientRaw != null && String(clientRaw).trim() !== '') {
    logDeprecatedEnterpriseId('enterprise_id', clientRaw, id, req);
  }
  b.enterprise_id = id;
  delete b.ENTERPRISE_ID;
  return b;
}
