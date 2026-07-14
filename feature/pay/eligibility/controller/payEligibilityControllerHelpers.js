import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import {
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_ERROR,
  HTTP_OK
} from '../constants/payEligibility.constants.js';
import {
  buildForbiddenErrorPayload,
  buildSystemErrorPayload,
  buildValidationErrorPayload,
  logTechnicalError
} from '../utils/payEligibilityResponseUtils.js';
import { firstValidationMessage } from '../validations/payEligibility.validation.js';

export function sendValidationError(res, err) {
  return res
    .status(HTTP_BAD_REQUEST)
    .json(buildValidationErrorPayload(firstValidationMessage(err)));
}

export function sendForbiddenError(res, err) {
  return res
    .status(HTTP_FORBIDDEN)
    .json(buildForbiddenErrorPayload(err.message));
}

export function sendSystemError(res, err) {
  logTechnicalError('evaluate failed', err instanceof DatabaseError ? err : err);
  return res.status(HTTP_INTERNAL_ERROR).json(buildSystemErrorPayload());
}

/**
 * Return package JSON directly. Package success=true/false both use HTTP 200.
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
