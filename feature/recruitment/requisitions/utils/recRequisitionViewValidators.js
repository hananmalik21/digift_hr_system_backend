import { ValidationError } from '../../../../utils/errors/index.js';

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

const STATUS_TAB_CLAUSES = {
  draft: "v.APPROVAL_STATUS_CODE = 'DRAFT'",
  submitted: "v.APPROVAL_STATUS_CODE = 'PENDING_APPROVAL'",
  approved: "v.APPROVAL_STATUS_CODE = 'APPROVED'",
  open: "v.APPROVAL_STATUS_CODE = 'APPROVED' AND v.OPEN_STATUS_CODE = 'OPEN'",
  closed: "v.APPROVAL_STATUS_CODE = 'APPROVED' AND v.OPEN_STATUS_CODE = 'CLOSED'"
};

const VALID_STATUS_ROUTES = new Set(Object.keys(STATUS_TAB_CLAUSES));

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {number}
 */
export function parseEnterpriseIdFromQuery(query) {
  const raw = query?.enterprise_id ?? query?.tenant_id;
  if (isBlank(raw)) {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a positive number']);
  }
  return n;
}

/**
 * @param {string} status
 * @returns {string} normalized tab key
 */
export function validateListStatusQuery(status) {
  const key = String(status ?? '').trim().toLowerCase();
  if (!VALID_STATUS_ROUTES.has(key)) {
    throw new ValidationError('Validation failed', [
      'status must be one of: draft, submitted, approved, open, closed'
    ]);
  }
  return key;
}

/** @deprecated Use validateListStatusQuery */
export const validateStatusRouteParam = validateListStatusQuery;

/**
 * @param {string} statusTab
 * @returns {string} SQL AND clause fragment (without leading AND)
 */
export function resolveStatusTabClause(statusTab) {
  const key = validateListStatusQuery(statusTab);
  return STATUS_TAB_CLAUSES[key];
}

/**
 * Org tree filter: match requisitions whose org_hierarchy_json contains the node.
 * Without level_code: selected org unit and all descendants (node appears on path to leaf).
 * With level_code: exact org_unit_id + level_code node (same as GET /api/employees).
 *
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ org_unit_id_hex: string|null, level_code: string|null }}
 */
export function parseOrgUnitHierarchyFilter(query) {
  const orgRaw = query?.org_unit_id ?? query?.orgUnitId;
  const levelRaw = query?.level_code ?? query?.levelCode;

  const hasOrg = !isBlank(orgRaw);
  const hasLevel = !isBlank(levelRaw);

  if (hasLevel && !hasOrg) {
    throw new ValidationError('Validation failed', ['level_code requires org_unit_id']);
  }

  if (!hasOrg) {
    return { org_unit_id_hex: null, level_code: null };
  }

  const compact = String(orgRaw).trim().replace(/-/g, '').toUpperCase();
  if (!/^[0-9A-F]{32}$/.test(compact)) {
    throw new ValidationError('Validation failed', ['org_unit_id must be a 32-character hex GUID']);
  }

  return {
    org_unit_id_hex: compact,
    level_code: hasLevel ? String(levelRaw).trim() : null
  };
}
