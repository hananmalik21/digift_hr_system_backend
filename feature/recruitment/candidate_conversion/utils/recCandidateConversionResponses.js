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
  GENERIC_TRANSFER_ERROR_MESSAGE,
  NEXT_ACTION_COMPLETE_ONBOARDING,
  NOTIFICATION_STATUS_FAILED,
  NOTIFICATION_STATUS_SENT,
  ONBOARDING_STATUS_FAILED,
  ONBOARDING_STATUS_TRIGGERED,
  TRANSFER_STATUS_COMPLETED,
  TRANSFER_SUCCESS_BOTH_SIDE_EFFECTS_FAILED_MESSAGE,
  TRANSFER_SUCCESS_MESSAGE,
  TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE,
  TRANSFER_SUCCESS_ONBOARDING_FAILED_MESSAGE
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

export function sendTransferDetailsResponse(res, data) {
  return sendPackageResponse(res, 200, { success: true, data });
}

export function sendTransferHistoryResponse(res, data) {
  return sendPackageResponse(res, 200, { success: true, data });
}

export function sendTransferSuccessResponse(res, data, message = TRANSFER_SUCCESS_MESSAGE) {
  return sendPackageResponse(res, 201, {
    success: true,
    message,
    data
  });
}

/**
 * @param {{ send_notification: boolean, trigger_onboarding: boolean, notification_status?: string|null, onboarding_status?: string|null }} flags
 */
export function transferSuccessMessage(flags) {
  const notificationFailed =
    flags.send_notification && flags.notification_status === NOTIFICATION_STATUS_FAILED;
  const onboardingFailed =
    flags.trigger_onboarding && flags.onboarding_status === ONBOARDING_STATUS_FAILED;
  if (notificationFailed && onboardingFailed) {
    return TRANSFER_SUCCESS_BOTH_SIDE_EFFECTS_FAILED_MESSAGE;
  }
  if (notificationFailed) return TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE;
  if (onboardingFailed) return TRANSFER_SUCCESS_ONBOARDING_FAILED_MESSAGE;
  return TRANSFER_SUCCESS_MESSAGE;
}

/**
 * @param {string} candidateGuidHex
 * @param {string} offerGuidHex
 * @param {{
 *   employee_id: number|null,
 *   employee_guid: string|null,
 *   employee_number: string|null,
 *   assignment_id: number|null,
 *   assignment_guid: string|null,
 *   transfer_id: number|null,
 *   transfer_guid: string|null
 * }} pkg
 * @param {{
 *   send_notification: boolean,
 *   trigger_onboarding: boolean,
 *   notification_status?: string|null,
 *   onboarding_status?: string|null,
 *   onboarding_reference?: string|null
 * }} sideEffects
 */
export function mapTransferSuccessData(candidateGuidHex, offerGuidHex, pkg, sideEffects) {
  return {
    candidate_guid: candidateGuidHex,
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
    transfer: {
      transfer_id: pkg.transfer_id,
      transfer_guid: pkg.transfer_guid,
      status: TRANSFER_STATUS_COMPLETED,
      notification: {
        requested: sideEffects.send_notification,
        status: sideEffects.send_notification
          ? sideEffects.notification_status || NOTIFICATION_STATUS_SENT
          : null
      },
      onboarding: {
        requested: sideEffects.trigger_onboarding,
        status: sideEffects.trigger_onboarding
          ? sideEffects.onboarding_status || ONBOARDING_STATUS_TRIGGERED
          : null,
        reference: sideEffects.onboarding_reference ?? null
      }
    }
  };
}

export function handleCandidateConversionError(res, err, fallback = {}) {
  const fallbackCode = fallback.code || ERROR_CODES.CANDIDATE_CONVERSION_FAILED;
  const fallbackMessage = fallback.message || GENERIC_ERROR_MESSAGE;

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
        : err.userMessage || err.message || fallbackMessage;
    return sendPackageResponse(res, err.statusCode || 500, {
      success: false,
      code: err.code || fallbackCode,
      message
    });
  }
  return sendPackageResponse(res, 500, {
    success: false,
    code: fallbackCode,
    message: fallbackMessage
  });
}

export function handleCandidateTransferError(res, err) {
  return handleCandidateConversionError(res, err, {
    code: ERROR_CODES.TRANSFER_FAILED,
    message: GENERIC_TRANSFER_ERROR_MESSAGE
  });
}
