import { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';
import { sendPackageResponse } from '../../shared/recControllerHelpers.js';
import { CREATE_SUCCESS_MESSAGE, OFFER_STATUS_SENT } from './recJobOfferConstants.js';

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
      status_code: OFFER_STATUS_SENT
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
