import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';
import { parsePagination } from '../../../../utils/paginationUtils.js';

export const DEFAULT_ACTOR = 'SYSTEM';

export function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? req.body?.user ?? DEFAULT_ACTOR;
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

/** @returns {{ search: string|null, status_code: string|null, category_code: string|null }} */
export function parseModuleListQuery(req) {
  const q = req.query || {};
  return {
    search: parseOptionalString(q, 'search'),
    status_code: parseOptionalString(q, 'status_code'),
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
  if (msg.includes('module_code')) return new ConflictError('Module code already exists');
  if (msg.includes('module_name')) return new ConflictError('Module name already exists');
  return err;
}
