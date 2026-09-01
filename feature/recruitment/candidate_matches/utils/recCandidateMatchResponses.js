import { buildPaginationMeta } from '@digifyhr/common';
import {
  AppError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError
} from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import { isTenantErrorCode, sendTenantError } from '../../../../utils/tenantErrors.js';
import {
  ADD_AS_APPLICANT_ERROR_MESSAGE,
  ADD_AS_APPLICANT_SUCCESS_MESSAGE,
  ALREADY_APPLIED_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  REQUISITION_NOT_FOUND_MESSAGE
} from './recCandidateMatchConstants.js';

function listMeta(page, pageSize, total) {
  const p = buildPaginationMeta(page, pageSize, total);
  return {
    page: p.page,
    page_size: p.pageSize,
    total: p.total,
    total_pages: p.totalPages,
    has_next: p.hasNext,
    has_previous: p.hasPrevious
  };
}

export function sendFindCandidatesResponse(res, { rows, total, page, limit, requisition, summary }) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: LIST_SUCCESS_MESSAGE,
    meta: listMeta(page, limit, total),
    requisition,
    summary,
    data: rows
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} data
 */
export function sendAddAsApplicantResponse(res, data) {
  return sendPackageResponse(res, 201, {
    success: true,
    message: ADD_AS_APPLICANT_SUCCESS_MESSAGE,
    data
  });
}

/**
 * Add-as-applicant errors: `{ success, message }` only (no Oracle / status leakage).
 * @param {import('express').Response} res
 * @param {unknown} err
 */
export function handleAddAsApplicantError(res, err) {
  if (err instanceof AppError && isTenantErrorCode(err.code)) {
    return sendTenantError(res, err.statusCode, err.code, err.message);
  }
  if (err instanceof UnauthorizedError) {
    return sendPackageResponse(res, 401, {
      success: false,
      message: err.userMessage || err.message || 'Unauthorized'
    });
  }
  if (err instanceof ValidationError) {
    return sendPackageResponse(res, 400, {
      success: false,
      message: firstValidationMessage(err)
    });
  }
  if (err instanceof NotFoundError) {
    return sendPackageResponse(res, 404, {
      success: false,
      message: err.userMessage || err.message || REQUISITION_NOT_FOUND_MESSAGE
    });
  }
  if (err instanceof ConflictError) {
    const payload = {
      success: false,
      message: err.userMessage || err.message || ALREADY_APPLIED_MESSAGE
    };
    if (err.details && typeof err.details === 'object') {
      payload.data = err.details;
    }
    return sendPackageResponse(res, 409, payload);
  }
  return sendPackageResponse(res, 500, {
    success: false,
    message: ADD_AS_APPLICANT_ERROR_MESSAGE
  });
}

export function sendRequisitionNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: REQUISITION_NOT_FOUND_MESSAGE
  });
}

export function sendFindCandidatesNotFound(res, _notFound) {
  return sendRequisitionNotFoundResponse(res);
}
