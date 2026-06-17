import { parseTenantId } from '../../../../utils/tenantUtils.js';
import { getActingEnterpriseId } from '../../../../utils/userContext.js';
import { ensureHex32 } from '../../../../utils/guidUtils.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { POSITION_ORG_UNIT_SCOPE } from '../constants/positions_constants.js';

const HEX32_GUID_RE = /^[0-9A-F]{32}$/;

function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

function normalizeGuidString(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim().replace(/-/g, '').toUpperCase();
}

function isNormalizedHex32Guid(normalizedUpper) {
  return HEX32_GUID_RE.test(normalizedUpper);
}

/**
 * Parse shared list/export query filters for GET /api/positions and /api/positions/export.
 * @param {import('express').Request['query']} query
 * @returns {{ filters: Record<string, unknown>, errors: string[] }}
 */
export function parsePositionListFilters(query) {
  const filters = {};
  const errors = [];

  if (query?.status) {
    filters.status = String(query.status).toUpperCase();
  }
  if (query?.search) {
    filters.search = String(query.search);
  }

  for (const key of ['org_structure_id', 'org_unit_id']) {
    if (query?.[key] !== undefined && query[key] !== null && String(query[key]).trim() !== '') {
      const normalized = normalizeGuidString(query[key]);
      if (!isNormalizedHex32Guid(normalized)) {
        errors.push(`${key} must be a valid GUID (32-hex or UUID)`);
      } else {
        filters[key] = normalized;
      }
    }
  }

  for (const key of ['job_family_id', 'job_level_id', 'grade_id']) {
    if (query?.[key] !== undefined && query[key] !== null && String(query[key]).trim() !== '') {
      const parsed = parseInt(query[key], 10);
      if (Number.isNaN(parsed)) {
        errors.push(`${key} must be a valid number`);
      } else {
        filters[key] = parsed;
      }
    }
  }

  if (query?.org_unit_scope !== undefined && query.org_unit_scope !== null && String(query.org_unit_scope).trim() !== '') {
    const scope = String(query.org_unit_scope).trim().toLowerCase();
    if (!Object.values(POSITION_ORG_UNIT_SCOPE).includes(scope)) {
      errors.push(`org_unit_scope must be one of: ${Object.values(POSITION_ORG_UNIT_SCOPE).join(', ')}`);
    } else {
      filters.org_unit_scope = scope;
    }
  }

  return { filters, errors };
}

/**
 * Parse query params for reporting-relationships list/export endpoints.
 * @param {import('express').Request['query']} query
 * @returns {{ positionId: string|null, includeHierarchy: boolean, errors: string[] }}
 */
export function parseReportingRelationshipsQuery(query) {
  const errors = [];
  let positionId = null;

  if (query && 'position_id' in query) {
    const value = String(query.position_id || '').trim();
    if (value) {
      const normalized = normalizeGuidString(value);
      if (!isNormalizedHex32Guid(normalized)) {
        errors.push('position_id must be a valid GUID (32-hex or UUID)');
      } else {
        positionId = normalized;
      }
    }
  }

  const includeHierarchy = query?.hierarchy !== 'false' && query?.hierarchy !== '0';

  return { positionId, includeHierarchy, errors };
}

/**
 * Validate query params for GET /api/positions/by-org-unit.
 * Positions are returned for the org unit and all descendants in the hierarchy.
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
