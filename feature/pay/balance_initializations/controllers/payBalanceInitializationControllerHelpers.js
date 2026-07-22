import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceInitializations.constants.js';
import { firstValidationMessage } from '../validations/payBalanceInitializations.validation.js';

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

export function sendNotFoundError(res, message) {
  return res.status(404).json({
    success: false,
    message: message || 'Not found',
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

export function sendMutationOutcome(res, outcome) {
  return res.status(outcome.httpStatus ?? 200).json({
    success: outcome.success,
    message: outcome.message,
    data: outcome.data ?? null
  });
}

export function sendReadOutcome(res, outcome, { defaultFailureStatus = 404 } = {}) {
  if (!outcome.success) {
    return res.status(outcome.httpStatus ?? defaultFailureStatus).json({
      success: false,
      message: outcome.message,
      data: null
    });
  }

  const payload = {
    success: true,
    message: outcome.message,
    data: outcome.data ?? (outcome.meta ? [] : null)
  };

  if (outcome.meta) {
    payload.meta = outcome.meta;
  }

  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export async function withPayBalanceInitializationErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
