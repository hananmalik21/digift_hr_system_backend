import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payEmployeeBalanceInquiry.constants.js';
import { firstValidationMessage } from '../validations/payEmployeeBalanceInquiry.validation.js';

export const FALLBACK_ERROR = GENERIC_TECHNICAL_ERROR;

export function sendValidationError(res, err) {
  return res.status(400).json({
    success: false,
    message: firstValidationMessage(err),
    data: null
  });
}

export function sendForbiddenError(res, err) {
  return res.status(403).json({
    success: false,
    message: err.message || 'Access denied',
    data: null
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: FALLBACK_ERROR,
      data: null
    });
  }
  return res.status(500).json({
    success: false,
    message: FALLBACK_ERROR,
    data: null
  });
}

/**
 * Main inquiry envelope: { success, message, data, pagination }
 */
export function sendInquiryOutcome(res, outcome) {
  return res.status(outcome.httpStatus ?? 200).json({
    success: true,
    message: outcome.message,
    data: outcome.data ?? [],
    pagination: outcome.pagination
  });
}

export async function withPayEmployeeBalanceInquiryErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
