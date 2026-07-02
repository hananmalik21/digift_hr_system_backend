import { DatabaseError } from '../../../../utils/errors/index.js';
import { getActingUsername } from '../../../../utils/userContext.js';
import { resolvePayElementFrequencyRulesUserMessage } from '../utils/payElementFrequencyRulesOracleErrors.js';

export const ROUTE_TAG = 'payElementFrequencyRules';
export const FALLBACK_ERROR = 'Unable to process element frequency rule. Please try again.';

export function resolveAuditActor(req) {
  return getActingUsername(req) ?? 'SYSTEM';
}

export function sendNotFoundError(res, message = 'Frequency rule not found') {
  return res.status(404).json({
    success: false,
    message
  });
}

export function sendSystemError(res, err) {
  if (err instanceof DatabaseError) {
    const message =
      err.userMessage ||
      resolvePayElementFrequencyRulesUserMessage(err.message, err.oracleError) ||
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
    if (outcome.data.frequency_rule_id != null) {
      payload.frequency_rule_id = outcome.data.frequency_rule_id;
    }
    if (outcome.data.frequency_rule_guid != null) {
      payload.frequency_rule_guid = outcome.data.frequency_rule_guid;
    }
  }

  return res.status(outcome.httpStatus ?? 200).json(payload);
}

export function logAudit(action, req, extra = {}) {
  const user = req.user?.username ?? 'SYSTEM';
  console.info(`[${ROUTE_TAG}]`, JSON.stringify({ action, user, ...extra }));
}

export async function withPayElementFrequencyRuleErrorHandling(res, work) {
  try {
    return await work();
  } catch (err) {
    return sendSystemError(res, err);
  }
}
