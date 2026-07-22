import {
  matchesMessagePattern,
  sanitizePackageBusinessMessage
} from '../../utils/payPackageMessageUtils.js';

const DEFAULT_ERROR_MESSAGE = 'Unable to process balance dimension.';

export function mapPackageBusinessMessage(packageMessage) {
  return sanitizePackageBusinessMessage(packageMessage, DEFAULT_ERROR_MESSAGE);
}

export function isBalanceDimensionNotFoundMessage(message) {
  return matchesMessagePattern(message, /does\s+not\s+exist|not\s+found/i);
}

export function isBalanceDimensionAlreadyExistsMessage(message) {
  return matchesMessagePattern(message, /already\s+exists|duplicate/i);
}

export function isBalanceDimensionCannotDeleteMessage(message) {
  return matchesMessagePattern(
    message,
    /cannot\s+be\s+deleted|being\s+used|in\s+use|referenced/i
  );
}

export function isBalanceDimensionRetrieveFailedMessage(message) {
  return matchesMessagePattern(
    message,
    /was\s+(created|updated)\s+but\s+could\s+not\s+be\s+retrieved/i
  );
}
