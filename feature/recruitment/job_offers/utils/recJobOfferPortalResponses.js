import { sendPackageResponse } from '../../shared/recControllerHelpers.js';
import {
  PORTAL_DETAIL_SUCCESS_MESSAGE,
  PORTAL_LIST_SUCCESS_MESSAGE,
  PORTAL_NOT_FOUND_MESSAGE
} from './recJobOfferPortalConstants.js';

/**
 * @param {import('express').Response} res
 * @param {unknown[]} rows
 * @param {{ page: number, limit: number, total: number }} meta
 */
export function sendCandidateOfferListResponse(res, rows, meta) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: PORTAL_LIST_SUCCESS_MESSAGE,
    data: rows,
    pagination: {
      page: meta.page,
      limit: meta.limit,
      total: meta.total
    }
  });
}

/**
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} detail
 */
export function sendCandidateOfferDetailResponse(res, detail) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: PORTAL_DETAIL_SUCCESS_MESSAGE,
    data: detail
  });
}

/** @param {import('express').Response} res */
export function sendCandidateOfferNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: PORTAL_NOT_FOUND_MESSAGE
  });
}
