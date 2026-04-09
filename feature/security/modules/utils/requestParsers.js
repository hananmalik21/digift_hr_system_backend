import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';

export const DEFAULT_ACTOR = 'SYSTEM';

export function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? req.body?.user ?? DEFAULT_ACTOR;
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

function parseOptionalString(query, key) {
  const raw = query?.[key];
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  return s === '' ? null : s;
}

export function parseOptionalYn(query, key) {
  const v = parseOptionalString(query, key);
  if (v == null) return null;
  const u = v.toUpperCase();
  if (u !== 'Y' && u !== 'N') {
    throw new ValidationError('Validation failed', [`${key} must be Y or N`]);
  }
  return u;
}

/** @returns {{ enterprise_id: number, search: string|null, status_code: string|null, active_flag: string|null, category_code: string|null }} */
export function parseModuleListQuery(req) {
  const q = req.query || {};
  return {
    enterprise_id: parseEnterpriseIdFrom(req),
    search: parseOptionalString(q, 'search'),
    status_code: parseOptionalString(q, 'status_code'),
    active_flag: parseOptionalYn(q, 'active_flag'),
    category_code: parseOptionalString(q, 'category_code')
  };
}

export function parseListPagination(query) {
  try {
    return parsePagination(query);
  } catch (e) {
    const msg = e?.message || 'Invalid pagination';
    throw new ValidationError('Validation failed', [msg]);
  }
}

export function mapModuleConflict(err) {
  if (!(err instanceof ConflictError)) return null;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('module_code')) return new ConflictError('duplicate module_code');
  if (msg.includes('module_name')) return new ConflictError('duplicate module_name');
  return err;
}
