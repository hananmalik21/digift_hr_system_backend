import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/payBalanceFeeds.constants.js';
import { firstValidationMessage } from '../validations/payBalanceFeeds.validation.js';

export const FALLBACK_ERROR = GENERIC_TECHNICAL_ERROR;

export function resolveAuditActor(req) {
  return getActingUsername(req) ?? req.body?.created_by ?? req.body?.updated_by ?? 'API';
}

export function resolveDeleteActor(req) {
  return req.user?.username ?? req.body?.updated_by ?? getActingUsername(req) ?? 'API';
}

export function sendValidationError(res, err) {
  return res.status(400).json({
    success: false,
    message: firstValidationMessage(err)
  });
}

export function sendForbiddenError(res, err) {
  return res.status(403).json({
    success: false,
    message: err.message || 'Access denied'
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: FALLBACK_ERROR
    });
  }
  return res.status(500).json({
    success: false,
    message: FALLBACK_ERROR
  });
}

export function sendMutationOutcome(res, outcome) {
  const payload = {
    success: outcome.success,
    message: outcome.message
  };

  if (outcome.success && outcome.data != null) {
    payload.data = outcome.data;
  }

  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export function sendReadOutcome(res, outcome, { defaultFailureStatus = 404, includePagination = false } = {}) {
  if (!outcome.success) {
    return res.status(outcome.httpStatus ?? defaultFailureStatus).json({
      success: false,
      message: outcome.message
    });
  }

  const payload = {
    success: true,
    message: outcome.message,
    data: outcome.data ?? (includePagination ? [] : undefined)
  };

  if (includePagination) {
    payload.pagination = outcome.pagination;
  }

  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export async function withPayBalanceFeedErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
