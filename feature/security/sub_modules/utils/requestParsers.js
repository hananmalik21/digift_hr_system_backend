import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';
import { parsePagination } from '@digifyhr/common';

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

function parseOptionalPositiveNumber(query, key) {
  const raw = query?.[key];
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', [`${key} must be a valid positive number`]);
  }
  return n;
}

/** @returns {{ module_id: number|null, search: string|null, status_code: string|null, category_code: string|null }} */
export function parseSubModuleListQuery(req) {
  const q = req.query || {};
  return {
    module_id: parseOptionalPositiveNumber(q, 'module_id'),
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

export function mapSubModuleConflict(err) {
  if (!(err instanceof ConflictError)) return null;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('sub-module code')) return new ConflictError('Sub-module code already exists in this module');
  return err;
}

