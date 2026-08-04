/**
 * Structured logging for tenant / hostname resolution (no secrets / PII).
 */

/**
 * @param {object} fields
 */
export function logTenantResolution(fields) {
  const safe = {
    request_id: fields.requestId ?? null,
    hostname: fields.hostname ?? null,
    subdomain_slug: fields.subdomainSlug ?? null,
    portal_type: fields.portalType ?? null,
    enterprise_id: fields.enterpriseId ?? null,
    result: fields.result ?? null,
    route: fields.route ?? null,
    http_status: fields.httpStatus ?? null
  };
  // eslint-disable-next-line no-console
  console.info('[tenant-resolve]', JSON.stringify(safe));
}

/**
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function getRequestId(req) {
  const h = req.headers?.['x-request-id'] ?? req.headers?.['x-correlation-id'];
  if (h != null && String(h).trim()) return String(h).trim().slice(0, 128);
  return null;
}

/**
 * @param {string} field
 * @param {unknown} clientValue
 * @param {number} resolvedId
 * @param {import('express').Request} [req]
 */
export function logDeprecatedEnterpriseId(field, clientValue, resolvedId, req) {
  // eslint-disable-next-line no-console
  console.info(
    '[tenant-resolve]',
    JSON.stringify({
      event: 'deprecated_client_enterprise_id',
      field,
      client_value: clientValue != null ? String(clientValue).slice(0, 32) : null,
      resolved_enterprise_id: resolvedId,
      route: req ? `${req.method} ${req.originalUrl || req.url}` : null
    })
  );
}
