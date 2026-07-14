import {
  ACCESS_DENIED_MESSAGE,
  EMPTY_EVALUATION_TRACE,
  GENERIC_TECHNICAL_ERROR,
  LOG_TAG,
  VALIDATION_REQUIRED_MESSAGE
} from '../constants/payEligibility.constants.js';

/**
 * Shared failure envelope used by validation / forbidden / backend error responses.
 * @param {string} message
 */
export function buildFailurePayload(message) {
  return {
    success: false,
    eligible: false,
    message,
    evaluation_trace: [...EMPTY_EVALUATION_TRACE]
  };
}

export function buildValidationErrorPayload(message = VALIDATION_REQUIRED_MESSAGE) {
  return buildFailurePayload(message);
}

export function buildForbiddenErrorPayload(message = ACCESS_DENIED_MESSAGE) {
  return buildFailurePayload(message);
}

export function buildSystemErrorPayload(message = GENERIC_TECHNICAL_ERROR) {
  return buildFailurePayload(message);
}

/**
 * Log technical error details server-side only (never send ORA text to clients).
 * @param {string} context
 * @param {unknown} err
 */
export function logTechnicalError(context, err) {
  const detail =
    err?.oracleError?.message ||
    err?.message ||
    err;
  console.error(`[${LOG_TAG}] ${context}`, detail);
}
