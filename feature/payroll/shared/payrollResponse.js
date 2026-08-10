/**
 * Standard DigifyHR payroll API response helpers.
 * Matches existing feature/pay list envelopes:
 * { success, message, data, meta: { pagination: { page, pageSize, total, totalPages, hasNext, hasPrevious } } }
 */

import { AppError, DatabaseError, ForbiddenError, ValidationError } from '../../../utils/errors/index.js';
import { getActingUsername } from '../../../utils/userContext.js';
import { buildPaginationMeta } from '../../../utils/paginationUtils.js';

export const FALLBACK_ERROR = 'Unable to process payroll request. Please try again.';

export function resolveAuditActor(req) {
  return getActingUsername(req) ?? req.body?.created_by ?? req.body?.updated_by ?? 'SYSTEM';
}

export function listMeta(page, pageSize, total) {
  return { pagination: buildPaginationMeta(page, pageSize, total) };
}

export function okList(message, data, page, pageSize, total) {
  return {
    success: true,
    httpStatus: 200,
    message,
    data: data ?? [],
    meta: listMeta(page, pageSize, total)
  };
}

export function okGet(message, data) {
  return {
    success: true,
    httpStatus: 200,
    message,
    data: data ?? null
  };
}

export function okMutation(message, data = null, httpStatus = 200, status = null) {
  return {
    success: true,
    httpStatus,
    message,
    data,
    ...(status != null ? { status } : {})
  };
}

export function failOutcome(message, httpStatus = 400, data = null) {
  return {
    success: false,
    httpStatus,
    message,
    data
  };
}

export function notFoundOutcome(message = 'Record not found') {
  return failOutcome(message, 404);
}

export function sendValidationError(res, err) {
  const message =
    err?.details?.[0]?.message ||
    err?.message ||
    'Validation failed';
  return res.status(400).json({ success: false, message, data: null });
}

export function sendForbiddenError(res, err) {
  return res.status(403).json({
    success: false,
    message: err?.message || 'Access denied',
    data: null
  });
}

export function sendSystemError(res, err, fallback = FALLBACK_ERROR) {
  if (err instanceof DatabaseError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.userMessage || fallback,
      data: null,
      error: err.oracleError
        ? {
            code: err.oracleError.errorNum != null ? `ORA-${err.oracleError.errorNum}` : null,
            database_message: err.oracleError.message || null,
            details: null
          }
        : undefined
    });
  }
  if (err instanceof AppError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.userMessage || err.message || fallback,
      data: null
    });
  }
  return res.status(500).json({ success: false, message: fallback, data: null });
}

export function sendOutcome(res, outcome) {
  if (!outcome?.success) {
    return res.status(outcome?.httpStatus ?? 400).json({
      success: false,
      message: outcome?.message || FALLBACK_ERROR,
      data: outcome?.data ?? null,
      error: outcome?.error
    });
  }

  const payload = {
    success: true,
    message: outcome.message,
    data: outcome.data ?? (outcome.meta ? [] : null)
  };
  if (outcome.status != null) payload.status = outcome.status;
  if (outcome.meta) payload.meta = outcome.meta;
  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export async function withPayrollErrorHandling(res, work, fallback = FALLBACK_ERROR) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err, fallback);
  }
}
