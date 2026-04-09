import { ValidationError } from '../../../../utils/errors/index.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';

export const DEFAULT_ACTOR = 'SYSTEM';

export function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? req.body?.user ?? req.body?.created_by ?? req.body?.last_updated_by ?? DEFAULT_ACTOR;
}

export function parseEnterpriseIdFrom(req, { fromBody = false } = {}) {
  const raw = fromBody
    ? (req.body?.enterprise_id ?? req.body?.ENTERPRISE_ID)
    : (req.query?.enterprise_id ?? req.body?.enterprise_id ?? req.body?.ENTERPRISE_ID);

  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new ValidationError('Validation failed', ['enterprise_id is required']);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', ['enterprise_id must be a valid positive number']);
  }
  return n;
}

function parseOptionalString(obj, key) {
  const raw = obj?.[key];
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

export function parseOptionalYn(obj, key) {
  const v = parseOptionalString(obj, key);
  if (v == null) return null;
  const u = v.toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${key} must be Y or N`]);
  }
  return u;
}

export function parseListPagination(query) {
  try {
    return parsePagination(query);
  } catch (e) {
    const msg = e?.message || 'Invalid pagination';
    throw new ValidationError('Validation failed', [msg]);
  }
}

/**
 * GET /api/security/functions?enterprise_id=&page=&page_size=&search=&module_guid=&active_flag=
 */
export function parseFunctionListQuery(req) {
  const q = req.query || {};
  return {
    enterprise_id: parseEnterpriseIdFrom(req),
    search: parseOptionalString(q, 'search'),
    module_guid: parseOptionalString(q, 'module_guid'),
    active_flag: parseOptionalYn(q, 'active_flag')
  };
}

