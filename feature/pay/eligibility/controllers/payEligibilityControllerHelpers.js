import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import {
  GENERIC_TECHNICAL_ERROR,
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_ERROR,
  HTTP_OK,
  LOG_TAG
} from '../constants/payEligibility.constants.js';
import { buildSystemErrorPayload } from '../utils/payEligibilityResponseUtils.js';
import { firstValidationMessage } from '../validations/payEligibility.validation.js';

export const FALLBACK_ERROR = GENERIC_TECHNICAL_ERROR;

export function sendValidationError(res, err) {
  return res.status(HTTP_BAD_REQUEST).json({
    success: false,
    message: firstValidationMessage(err)
  });
}

export function sendForbiddenError(res, err) {
  return res.status(HTTP_FORBIDDEN).json({
    success: false,
    message: err.message || 'Access denied'
  });
}

export function sendSystemError(res, err) {
  console.error(
    `[${LOG_TAG}] evaluate failed`,
    err instanceof DatabaseError ? err.oracleError?.message || err.message : err?.message || err
  );

  return res.status(HTTP_INTERNAL_ERROR).json(buildSystemErrorPayload());
}

/**
 * Return package JSON directly. Business outcomes with success=false still use HTTP 200.
 *
 * @param {import('express').Response} res
 * @param {Record<string, unknown>} result
 */
export function sendEvaluateOutcome(res, result) {
  return res.status(HTTP_OK).json(result);
}

export async function withPayEligibilityErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
