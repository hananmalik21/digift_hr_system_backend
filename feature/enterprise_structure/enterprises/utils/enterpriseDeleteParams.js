/**
 * Parse and validate Enterprise request parameters.
 */
import { ValidationError } from '../../../../utils/errors/index.js';

export const HARD_DELETE_CONFLICT_MESSAGE =
  'Enterprise cannot be permanently deleted because related records exist. Use soft delete instead.';

const FK_DELETE_CONFLICT_RE =
  /referenced by other records|cannot delete.*referenced|use soft delete|cannot be permanently deleted|related records exist/i;

/**
 * Explicit boolean query parsing.
 * Avoid Boolean(value) — both "true" and "false" are truthy strings.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function parseBooleanQuery(value) {
  if (value == null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return normalized === 'true' || normalized === '1';
}

/** @param {unknown} value @returns {boolean} */
export function parseHardDeleteQuery(value) {
  return parseBooleanQuery(value);
}

/** @param {unknown} value @returns {boolean} */
export function parseAutoFallbackQuery(value) {
  return parseBooleanQuery(value);
}

/**
 * @param {unknown} rawId
 * @returns {number}
 */
export function parseEnterpriseIdParam(rawId) {
  if (rawId == null || String(rawId).trim() === '') {
    throw new ValidationError('enterprise_id is required');
  }
  const enterpriseId = Number(rawId);
  if (!Number.isInteger(enterpriseId) || enterpriseId <= 0) {
    throw new ValidationError('Invalid ENTERPRISE_ID format');
  }
  return enterpriseId;
}

/**
 * Actor string for Oracle package payload.
 * @param {import('express').Request} req
 * @returns {string}
 */
export function resolveEnterpriseActor(req) {
  const headerActor = req.headers?.['x-user-id'];
  if (headerActor != null && String(headerActor).trim() !== '') {
    return String(headerActor).trim();
  }
  if (req.user?.username) return String(req.user.username);
  if (req.user?.email) return String(req.user.email);
  if (req.user?.id != null) return String(req.user.id);
  return 'SYSTEM';
}

/**
 * Build ENT_ENTERPRISES_PKG DELETE payload.
 * @param {{ enterpriseId: number, hardDelete: boolean, actor: string }} params
 */
export function buildEnterpriseDeletePayload({ enterpriseId, hardDelete, actor }) {
  return {
    enterprise_id: enterpriseId,
    hard: hardDelete ? 1 : 0,
    actor: actor || 'SYSTEM'
  };
}

/**
 * @param {Error & { errorNum?: number, code?: string, technicalMessage?: string }} error
 * @returns {boolean}
 */
export function isFkDeleteConflict(error) {
  if (!error) return false;
  if (error.errorNum === 2292 || error.code === 'FOREIGN_KEY_CONSTRAINT') return true;
  return FK_DELETE_CONFLICT_RE.test(error.message || '')
    || FK_DELETE_CONFLICT_RE.test(error.technicalMessage || '');
}

/**
 * Shape package delete result for HTTP responses.
 * @param {number} enterpriseId
 * @param {boolean} hard
 * @param {Record<string, unknown>|null|undefined} result
 */
export function shapeEnterpriseDeleteResult(enterpriseId, hard, result = {}) {
  const row = result && typeof result === 'object' ? result : {};
  const deleteType = String(row.delete_type || (hard ? 'HARD' : 'SOFT')).toUpperCase();
  const deleted = hard
    || row.deleted === true
    || row.deleted === 'Y'
    || row.deleted === 1;

  return {
    enterprise_id: Number(row.enterprise_id ?? enterpriseId),
    delete_type: deleteType,
    deleted,
    ...(hard ? {} : { is_active: row.is_active ?? 'N' }),
    message: row.message
  };
}
