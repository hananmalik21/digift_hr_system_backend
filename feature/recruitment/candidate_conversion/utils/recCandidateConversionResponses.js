import { AppError, UnauthorizedError } from '../../../../utils/errors/index.js';
import {
  firstValidationMessage,
  sendPackageResponse
} from '../../shared/recControllerHelpers.js';
import { isTenantErrorCode, sendTenantError } from '../../../../utils/tenantErrors.js';
import {
  CONVERSION_STATUS_COMPLETED,
  CONVERT_SUCCESS_MESSAGE,
  ERROR_CODES,
  GENERIC_ERROR_MESSAGE,
  NEXT_ACTION_COMPLETE_ONBOARDING
} from './recCandidateConversionConstants.js';

/**
 * GET validate — `can_convert=false` is HTTP 200, not a server error.
 *
 * @param {import('express').Response} res
 * @param {{ offer_guid: string, can_convert: boolean, message: string }} data
 */
export function sendValidateConversionResponse(res, data) {
  return sendPackageResponse(res, 200, {
    success: true,
    data: {
      offer_guid: data.offer_guid,
      can_convert: data.can_convert,
      message: data.message
    }
  });
}

/**
 * POST convert — HTTP 201 with nested employee + assignment.
 *
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} data
 */
export function sendConvertSuccessResponse(res, data) {
  return sendPackageResponse(res, 201, {
    success: true,
    message: CONVERT_SUCCESS_MESSAGE,
    data
  });
}

/**
 * @param {string} offerGuidHex
 * @param {{
 *   employee_id: number|null,
 *   employee_guid: string|null,
 *   employee_number: string|null,
 *   assignment_id: number|null,
 *   assignment_guid: string|null
 * }} pkg
 * @param {{ candidate_guid?: string }} [extra]
 */
export function mapConvertSuccessData(offerGuidHex, pkg, extra = {}) {
  const data = {
    offer_guid: offerGuidHex,
    employee: {
      employee_id: pkg.employee_id,
      employee_guid: pkg.employee_guid,
      employee_number: pkg.employee_number
    },
    assignment: {
      assignment_id: pkg.assignment_id,
      assignment_guid: pkg.assignment_guid
    },
    conversion_status: CONVERSION_STATUS_COMPLETED,
    next_action: NEXT_ACTION_COMPLETE_ONBOARDING
  };
  if (extra.candidate_guid) {
    data.candidate_guid = extra.candidate_guid;
  }
  return data;
}

/**
 * Domain errors: `{ success, code, message }` without Oracle stacks or SQL.
 *
 * @param {import('express').Response} res
 * @param {unknown} err
 */
export function handleCandidateConversionError(res, err) {
  if (err instanceof AppError && isTenantErrorCode(err.code)) {
    return sendTenantError(res, err.statusCode, err.code, err.message);
  }
  if (err instanceof UnauthorizedError) {
    return sendPackageResponse(res, 401, {
      success: false,
      code: ERROR_CODES.UNAUTHORIZED,
      message: err.userMessage || err.message || 'Unauthorized'
    });
  }
  if (err instanceof AppError) {
    const message =
      err.name === 'ValidationError'
        ? firstValidationMessage(err)
        : err.userMessage || err.message || GENERIC_ERROR_MESSAGE;
    return sendPackageResponse(res, err.statusCode || 500, {
      success: false,
      code: err.code || ERROR_CODES.CANDIDATE_CONVERSION_FAILED,
      message
    });
  }
  return sendPackageResponse(res, 500, {
    success: false,
    code: ERROR_CODES.CANDIDATE_CONVERSION_FAILED,
    message: GENERIC_ERROR_MESSAGE
  });
}
