/**
 * Shared tenant utilities for request handling.
 * Use for APIs that require tenant_id from body or query.
 */
import { ValidationError } from './errors/index.js';
import { getActingEnterpriseId } from './userContext.js';

/**
 * Get tenant_id from request (query, body, header, or user context).
 * Use for GET list, GET single, PUT, PATCH, DELETE where tenant is required for filtering.
 *
 * @param {object} req - Express request
 * @param {object} [options] - Optional: { fromBodyOnly: true } to only read from body; { fromQueryAndBodyOnly: true } to skip header/user
 * @returns {number} Valid tenant ID (positive integer)
 * @throws {ValidationError} When tenant_id is missing or invalid
 */
export function getTenantId(req, options = {}) {
  const fromBodyOnly = options.fromBodyOnly === true;
  const fromQueryAndBodyOnly = options.fromQueryAndBodyOnly === true;
  let raw;

  if (fromBodyOnly) {
    raw = req.body?.tenant_id ?? req.body?.TENANT_ID;
  } else {
    raw =
      req.query?.tenant_id ??
      req.body?.tenant_id ??
      req.body?.TENANT_ID ??
      (fromQueryAndBodyOnly ? undefined : req.headers?.['x-enterprise-id'] ?? req.user?.enterprise_id);
  }

  return parseTenantId(raw, 'tenant_id is required (pass in query params or request body)');
}

/**
 * Parse and validate tenant_id from a raw value (e.g. from request body).
 * Use in POST create to require tenant_id in body and return a number for INSERT.
 *
 * @param {*} raw - Raw value (number, string, etc.)
 * @param {string} [missingMessage] - Message when value is missing
 * @returns {number} Valid tenant ID (positive integer)
 * @throws {ValidationError} When value is missing or invalid
 */
export function parseTenantId(raw, missingMessage = 'tenant_id is required') {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError(missingMessage);
  }
  const tenantId = parseInt(raw, 10);
  if (!Number.isFinite(tenantId) || tenantId < 1) {
    throw new ValidationError('tenant_id must be a valid positive number');
  }
  return tenantId;
}

/**
 * Ensure request body has tenant_id and return validated number.
 * Use for POST create: call then set data.tenant_id = result before passing to model.
 *
 * @param {object} data - Request body (e.g. toUpperCaseKeys(req.body))
 * @param {string} [missingMessage] - Message when tenant_id is missing
 * @returns {number} Valid tenant ID
 * @throws {ValidationError} When tenant_id is missing or invalid
 */
export function requireTenantIdInBody(data, missingMessage = 'tenant_id is required in request body') {
  const raw = data?.tenant_id ?? data?.TENANT_ID;
  return parseTenantId(raw, missingMessage);
}

/**
 * Parse and validate enterprise_id from a raw value.
 *
 * @param {*} raw - Raw value (number, string, etc.)
 * @param {string} [missingMessage] - Message when value is missing
 * @returns {number} Valid enterprise ID (positive integer)
 * @throws {ValidationError} When value is missing or invalid
 */
export function parseEnterpriseId(raw, missingMessage = 'enterprise_id is required') {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError(missingMessage);
  }
  const enterpriseId = parseInt(raw, 10);
  if (!Number.isFinite(enterpriseId) || enterpriseId < 1) {
    throw new ValidationError('enterprise_id must be a valid positive number');
  }
  return enterpriseId;
}

/**
 * Require enterprise_id from query string (?enterprise_id=).
 *
 * @param {import('express').Request} req
 * @returns {number}
 * @throws {ValidationError}
 */
export function requireEnterpriseIdFromQuery(req) {
  return parseEnterpriseId(
    req.query?.enterprise_id ?? req.query?.enterpriseId,
    'enterprise_id is required'
  );
}

/**
 * Resolve tenant_id with JWT enterprise scoping.
 *
 * JWT `enterprise_id` always wins; client-supplied tenant cannot override.
 *
 * @param {import('express').Request} req
 * @param {object} [options] - Same options as getTenantId
 * @returns {number}
 * @throws {ValidationError}
 */
export function getScopedTenantId(req, options = {}) {
  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null) {
    return tokenEnterpriseId;
  }

  return getTenantId(req, options);
}
