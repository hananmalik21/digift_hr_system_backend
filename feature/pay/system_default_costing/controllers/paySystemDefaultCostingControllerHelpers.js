import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { GENERIC_TECHNICAL_ERROR } from '../constants/paySystemDefaultCosting.constants.js';
import { firstValidationMessage } from '../validations/paySystemDefaultCosting.validation.js';

export const FALLBACK_ERROR = GENERIC_TECHNICAL_ERROR;

export function resolveCreateActor(req) {
  return req.validated?.created_by ?? getActingUsername(req) ?? req.body?.created_by ?? 'SYSTEM';
}

export function resolveUpdateActor(req) {
  return (
    req.validated?.updated_by ??
    getActingUsername(req) ??
    req.body?.updated_by ??
    req.body?.last_updated_by ??
    'SYSTEM'
  );
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

export function sendNotFoundError(res, message = 'Not found') {
  return res.status(404).json({
    success: false,
    message
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    return res.status(err.statusCode || 500).json({
      success: false,
      message: err.userMessage || FALLBACK_ERROR
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
  if (outcome.data != null) payload.data = outcome.data;
  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export function sendSuccess(res, { message, data, meta, status = 200 }) {
  const payload = {
    success: true,
    message,
    data: data ?? (meta ? [] : {})
  };
  if (meta) payload.meta = meta;
  return res.status(status).json(payload);
}

export async function withSystemDefaultCostingErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
