import { parseTenantId } from '../../../../utils/tenantUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { ensureHex32 } from '../../../../utils/guidUtils.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

/**
 * Validate query params for GET /api/positions/by-org-unit.
 *
 * @param {import('express').Request} req
 * @returns {{ ok: true, tenantId: number, orgUnitIdHex: string, page: number, pageSize: number } | { ok: false, message: string, statusCode?: number }}
 */
export function validateGetPositionsByOrgUnit(req) {
  if (isBlank(req.query?.tenant_id)) {
    return { ok: false, message: 'tenant_id is required' };
  }

  let tenantId;
  try {
    tenantId = parseTenantId(req.query.tenant_id, 'tenant_id is required');
  } catch (err) {
    return { ok: false, message: err.message };
  }

  const tokenEnterpriseId = getActingEnterpriseId(req);
  if (tokenEnterpriseId != null && tokenEnterpriseId !== tenantId) {
    return {
      ok: false,
      statusCode: 403,
      message: 'Access denied: tenant_id does not match authenticated enterprise',
    };
  }

  if (isBlank(req.query?.org_unit_id)) {
    return { ok: false, message: 'org_unit_id is required' };
  }

  let orgUnitIdHex;
  try {
    orgUnitIdHex = ensureHex32(req.query.org_unit_id, 'org_unit_id');
  } catch (err) {
    const message = err instanceof ValidationError ? err.message : 'org_unit_id must be a valid RAW hex GUID (32 characters)';
    return { ok: false, message };
  }

  try {
    const { page, pageSize } = parsePagination(req.query);
    return { ok: true, tenantId, orgUnitIdHex, page, pageSize };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}
