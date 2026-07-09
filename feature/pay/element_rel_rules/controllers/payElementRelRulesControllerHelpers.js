import { DatabaseError, ForbiddenError, ValidationError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { resolvePayElementRelRulesUserMessage } from '../utils/payElementRelRulesOracleErrors.js';
import { firstValidationMessage } from '../validations/payElementRelRules.validation.js';

export const ROUTE_TAG = 'payElementRelRules';
export const FALLBACK_ERROR = 'Unable to process element relationship rule. Please try again.';
export const NOT_FOUND_MESSAGE = 'Relationship rule not found';

export function resolveAuditActor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
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

export function sendNotFoundError(res, message = NOT_FOUND_MESSAGE) {
  return res.status(404).json({
    success: false,
    message
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    const message =
      err.userMessage ||
      resolvePayElementRelRulesUserMessage(err.message, err.oracleError) ||
      FALLBACK_ERROR;
    return res.status(err.statusCode || 500).json({
      success: false,
      message
    });
  }
  return res.status(500).json({
    success: false,
    message: FALLBACK_ERROR
  });
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

export function sendMutationOutcome(res, outcome) {
  const payload = {
    success: outcome.success,
    message: outcome.message
  };

  if (outcome.data != null) {
    payload.data = outcome.data;
    if (outcome.data.rule_id != null) {
      payload.rule_id = outcome.data.rule_id;
    }
    if (outcome.data.rule_guid != null) {
      payload.rule_guid = outcome.data.rule_guid;
    }
  }

  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

export async function withPayElementRelRuleErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof ValidationError) return sendValidationError(res, err);
    if (err instanceof ForbiddenError) return sendForbiddenError(res, err);
    return sendSystemError(res, err);
  }
}
