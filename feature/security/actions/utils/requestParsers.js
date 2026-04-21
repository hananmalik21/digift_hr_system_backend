import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';

export const DEFAULT_ACTOR = 'SYSTEM';

export function resolveActor(req) {
  return req.user?.username ?? req.user?.userName ?? req.body?.user ?? DEFAULT_ACTOR;
}

export function mapActionConflict(err) {
  if (!(err instanceof ConflictError)) return null;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('action code')) return new ConflictError('Action code already exists in this sub-module');
  return err;
}

export function parsePositiveIdOrThrow(fieldName, raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError('Validation failed', [`${fieldName} must be a valid positive number`]);
  }
  return n;
}

