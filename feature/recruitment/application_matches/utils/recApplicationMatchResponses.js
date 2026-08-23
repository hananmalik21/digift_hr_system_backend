import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { sendPackageResponse } from '../../shared/recControllerHelpers.js';
import {
  APPLICATION_NOT_FOUND_MESSAGE,
  BATCH_RECALCULATE_SUCCESS_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  RECALCULATE_SUCCESS_MESSAGE,
  REQUISITION_NOT_FOUND_MESSAGE,
  SUMMARY_SUCCESS_MESSAGE
} from './recApplicationMatchConstants.js';

function listMeta(page, pageSize, total) {
  const p = buildPaginationMeta(page, pageSize, total);
  return {
    page: p.page,
    page_size: p.pageSize,
    total: p.total,
    total_pages: p.totalPages
  };
}

export function sendMatchListResponse(res, { rows, total, page, limit, requisition, summary }) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: LIST_SUCCESS_MESSAGE,
    meta: listMeta(page, limit, total),
    requisition,
    summary,
    data: rows
  });
}

export function sendMatchDetailResponse(res, data) {
  return sendPackageResponse(res, 200, {
    success: true,
    data
  });
}

export function sendMatchSummaryResponse(res, data) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: SUMMARY_SUCCESS_MESSAGE,
    data
  });
}

export function sendRecalculateOneResponse(res, data) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: RECALCULATE_SUCCESS_MESSAGE,
    data
  });
}

export function sendRecalculateAllResponse(res, data) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: BATCH_RECALCULATE_SUCCESS_MESSAGE,
    data
  });
}

export function sendRequisitionNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: REQUISITION_NOT_FOUND_MESSAGE
  });
}

export function sendApplicationNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: APPLICATION_NOT_FOUND_MESSAGE
  });
}
