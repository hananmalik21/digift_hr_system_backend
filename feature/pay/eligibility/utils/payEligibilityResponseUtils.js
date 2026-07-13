import {
  EMPTY_EVALUATION_TRACE,
  GENERIC_TECHNICAL_ERROR
} from '../constants/payEligibility.constants.js';

/**
 * Standard HTTP 500 payload for eligibility evaluation failures.
 */
export function buildSystemErrorPayload() {
  return {
    success: false,
    eligible: false,
    message: GENERIC_TECHNICAL_ERROR,
    evaluation_trace: [...EMPTY_EVALUATION_TRACE]
  };
}
