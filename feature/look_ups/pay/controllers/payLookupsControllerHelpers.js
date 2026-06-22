import { DatabaseError, NotFoundError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { parsePageLimit } from '../../../../utils/paginationUtils.js';

export const ROUTE_TAG = 'payLookups';
export const FALLBACK_ERROR = 'Unable to process payroll lookup. Please try again.';

export function resolveAuditActor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

export function validationErrors(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details.length > 0 ? details : [err?.message || 'Validation failed'];
}

export function sendValidationError(res, err) {
  return res.status(400).json({
    success: false,
    message: 'Validation failed',
    errors: validationErrors(err)
  });
}

export function sendNotFoundError(res, err) {
  return res.status(404).json({
    success: false,
    message: err.message || 'Resource not found',
    errors: []
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    return res.status(500).json({
      success: false,
      message: err.userMessage || FALLBACK_ERROR,
      errors: []
    });
  }
  return res.status(500).json({
    success: false,
    message: FALLBACK_ERROR,
    errors: []
  });
}

export function sendSuccess(res, { message, data, meta, status = 200 }) {
  const payload = {
    success: true,
    message,
    data: data ?? {}
  };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

export function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

export function parseListPagination(req) {
  try {
    const { page, limit } = parsePageLimit(req.query);
    return { page, limit };
  } catch (err) {
    throw new ValidationError(err.message);
  }
}

/**
 * @param {import('express').Response} res
 * @param {() => Promise<import('express').Response|void>} work
 */
export async function withPayLookupErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof NotFoundError) return sendNotFoundError(res, err);
    return sendSystemError(res, err);
  }
}
