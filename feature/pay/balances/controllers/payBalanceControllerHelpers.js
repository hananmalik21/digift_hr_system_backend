import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { GENERIC_TECHNICAL_ERROR } from '../model/payBalancesModel.js';
import { firstValidationMessage } from '../validations/payBalances.validation.js';

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

export function sendNotFoundError(res, message) {
  return res.status(404).json({
    success: false,
    message
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

export function sendGetOutcome(res, outcome) {
  if (!outcome.success) {
    return res.status(outcome.httpStatus ?? 404).json({
      success: false,
      message: outcome.message
    });
  }

  return res.status(outcome.httpStatus ?? 200).json({
    success: true,
    message: outcome.message,
    data: outcome.data
  });
}

export function sendListOutcome(res, outcome) {
  if (!outcome.success) {
    return res.status(outcome.httpStatus ?? 400).json({
      success: false,
      message: outcome.message
    });
  }

  return res.status(outcome.httpStatus ?? 200).json({
    success: true,
    message: outcome.message,
    data: outcome.data ?? []
  });
}

export async function withPayBalanceErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
