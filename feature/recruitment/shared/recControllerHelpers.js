import { DatabaseError, ValidationError } from '../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../utils/paginationUtils.js';
import { getActingUsername } from '../../../utils/userContext.js';

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

export function resolveAuditActor(req, body, field) {
  const fromBody = body?.[field];
  if (fromBody != null && String(fromBody).trim() !== '') return String(fromBody).trim();
  return getActingUsername(req) ?? 'SYSTEM';
}

export function sendPackageResponse(res, httpStatus, payload) {
  return res.status(httpStatus).json(payload);
}

export function sendValidationError(res, err) {
  return sendPackageResponse(res, 400, {
    success: false,
    status: 'ERROR',
    message: firstValidationMessage(err)
  });
}

export function buildListPaginationMeta(page, pageSize, total) {
  const p = buildPaginationMeta(page, pageSize, total);
  return {
    pagination: {
      page: p.page,
      page_size: p.pageSize,
      total: p.total,
      total_pages: p.totalPages,
      has_next: p.hasNext,
      has_previous: p.hasPrevious
    }
  };
}

export function handleReadError(res, err, fallbackMessage) {
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
  }
  if (err instanceof DatabaseError) {
    return sendPackageResponse(res, 500, {
      success: false,
      message: err.userMessage || fallbackMessage
    });
  }
  return sendPackageResponse(res, 500, { success: false, message: fallbackMessage });
}

export function handleMutationError(res, err, fallbackMessage) {
  if (err instanceof ValidationError) {
    return sendValidationError(res, err);
  }
  return sendPackageResponse(res, 500, {
    success: false,
    status: 'ERROR',
    message: fallbackMessage
  });
}
