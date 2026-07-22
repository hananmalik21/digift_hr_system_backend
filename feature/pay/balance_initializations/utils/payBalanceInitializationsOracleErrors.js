import {
  matchesMessagePattern,
  sanitizePackageBusinessMessage
} from '../../utils/payPackageMessageUtils.js';

const DEFAULT_ERROR_MESSAGE = 'Unable to process balance initialization.';

export function mapPackageBusinessMessage(packageMessage) {
  return sanitizePackageBusinessMessage(packageMessage, DEFAULT_ERROR_MESSAGE);
}

/**
 * True only for genuine missing-record messages.
 * Do not match generic "selected employee/balance/dimension" validation wording.
 */
export function isBalanceInitializationNotFoundMessage(message) {
  return matchesMessagePattern(message, /(does\s+not\s+exist|not\s+found)/i);
}

export function isBalanceInitializationAlreadyExistsMessage(message) {
  return matchesMessagePattern(message, /already\s+exists|duplicate/i);
}

export function isBalanceInitializationCannotDeleteMessage(message) {
  return matchesMessagePattern(
    message,
    /cannot\s+be\s+deleted|being\s+used|in\s+use|referenced/i
  );
}

/** Post-commit view reload failures are technical, not client validation. */
export function isBalanceInitializationRetrieveFailedMessage(message) {
  return matchesMessagePattern(
    message,
    /was\s+(created|updated)\s+but\s+could\s+not\s+be\s+retrieved/i
  );
}
