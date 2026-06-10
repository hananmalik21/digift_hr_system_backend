import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { sendPackageResponse } from '../../shared/recControllerHelpers.js';
import {
  CREATE_SUCCESS_MESSAGE,
  DETAIL_SUCCESS_MESSAGE,
  LIST_SUCCESS_MESSAGE,
  NOT_FOUND_MESSAGE,
  OFFER_STAGE_DESCRIPTION_DRAFT,
  OFFER_STAGE_DRAFT,
  OFFER_STATUS_DRAFT
} from './recJobOfferConstants.js';

/**
 * @param {import('express').Response} res
 * @param {unknown[]} rows
 * @param {{ page: number, limit: number, total: number }} meta
 */
export function sendJobOfferListResponse(res, rows, meta) {
  return sendPackageResponse(res, 200, {
    status: 'success',
    message: LIST_SUCCESS_MESSAGE,
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
export function sendJobOfferDetailResponse(res, detail) {
  return sendPackageResponse(res, 200, {
    success: true,
    message: DETAIL_SUCCESS_MESSAGE,
    data: detail
  });
}

/** @param {import('express').Response} res */
export function sendJobOfferNotFoundResponse(res) {
  return sendPackageResponse(res, 404, {
    success: false,
    message: NOT_FOUND_MESSAGE
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string, offer_id?: number|null, offer_guid?: string|null }} pkg
 */
export function sendCreateJobOfferResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  if (!success) {
    return sendPackageResponse(res, 400, {
      success: false,
      status: pkg.status ?? 'ERROR',
      message
    });
  }

  return sendPackageResponse(res, 200, {
    success: true,
    status: pkg.status ?? 'SUCCESS',
    message: message || CREATE_SUCCESS_MESSAGE,
    data: {
      offer_id: pkg.offer_id ?? null,
      offer_guid: pkg.offer_guid ?? null,
      stage: OFFER_STAGE_DRAFT,
      status_code: OFFER_STATUS_DRAFT,
      stage_description: OFFER_STAGE_DESCRIPTION_DRAFT
    }
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ status?: string, message?: string }} pkg
 */
export function sendJobOfferActionResponse(res, pkg) {
  const success = packageStatusIsSuccess(pkg.status);
  const message = pkg.message ?? '';
  const httpStatus = success ? 200 : 400;

  return sendPackageResponse(res, httpStatus, {
    success,
    status: pkg.status ?? (success ? 'SUCCESS' : 'ERROR'),
    message
  });
}
