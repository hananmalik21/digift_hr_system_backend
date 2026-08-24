import {
  AppError,
  ConflictError,
  DatabaseError,
  NotFoundError,
  ValidationError
} from '../../../utils/errors/index.js';
import { buildPaginationMeta } from '../../../utils/paginationUtils.js';
import { getActingUsername } from '../../../utils/userContext.js';
import { isTenantErrorCode, sendTenantError } from '../../../utils/tenantErrors.js';
import { resolveRequestEnterpriseId } from '../../../utils/requestEnterprise.js';

function handleTenantAppError(res, err) {
  if (err instanceof AppError && isTenantErrorCode(err.code)) {
    return sendTenantError(res, err.statusCode, err.code, err.message);
  }
  return null;
}

export function firstValidationMessage(err) {
  const details = Array.isArray(err?.errors) ? err.errors.filter(Boolean) : [];
  return details[0] || err?.message || 'Validation failed';
}

/**
 * Resolve enterprise_id for recruitment GET handlers (query / tenant / hostname / JWT).
 * @param {import('express').Request} req
 * @returns {number}
 */
export function resolveEnterpriseIdFromRequestQuery(req) {
  return resolveRequestEnterpriseId(req, {
    clientRaw: req.query?.enterprise_id ?? req.query?.tenant_id
  });
}

/** @param {string} tag @param {string} action @param {import('express').Request} req @param {Record<string, unknown>} [extra] */
export function logRecruitmentAudit(tag, action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${tag}]`, JSON.stringify({ action, user, ...extra }));
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
  const tenant = handleTenantAppError(res, err);
  if (tenant) return tenant;
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, { success: false, message: firstValidationMessage(err) });
  }
  if (err instanceof NotFoundError) {
    return sendPackageResponse(res, 404, {
      success: false,
      message: err.userMessage || err.message || fallbackMessage
    });
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
  const tenant = handleTenantAppError(res, err);
  if (tenant) return tenant;
  if (err instanceof ValidationError) {
    return sendValidationError(res, err);
  }
  if (err instanceof NotFoundError) {
    return sendPackageResponse(res, 404, {
      success: false,
      message: err.userMessage || err.message || fallbackMessage
    });
  }
  if (err instanceof ConflictError) {
    return sendPackageResponse(res, 409, {
      success: false,
      message: err.userMessage || err.message || fallbackMessage
    });
  }
  return sendPackageResponse(res, 500, {
    success: false,
    status: 'ERROR',
    message: fallbackMessage
  });
}

/** Career portal JSON errors: `{ success, message }` without ERP `status` field. */
export function handlePortalError(res, err, fallbackMessage) {
  const tenant = handleTenantAppError(res, err);
  if (tenant) return tenant;
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, {
      success: false,
      message: firstValidationMessage(err)
    });
  }
  if (err instanceof NotFoundError) {
    return sendPackageResponse(res, 404, {
      success: false,
      message: err.userMessage || err.message || fallbackMessage
    });
  }
  return sendPackageResponse(res, 500, { success: false, message: fallbackMessage });
}
