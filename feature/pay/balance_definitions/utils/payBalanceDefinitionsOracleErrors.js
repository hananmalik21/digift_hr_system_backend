import {
  matchesMessagePattern,
  sanitizePackageBusinessMessage
} from '../../utils/payPackageMessageUtils.js';

const DEFAULT_ERROR_MESSAGE = 'Unable to process balance definition.';

export function mapPackageBusinessMessage(packageMessage) {
  return sanitizePackageBusinessMessage(packageMessage, DEFAULT_ERROR_MESSAGE);
}

export function isBalanceDefinitionNotFoundMessage(message) {
  return matchesMessagePattern(message, /does\s+not\s+exist|not\s+found/i);
}

export function isBalanceDefinitionAlreadyExistsMessage(message) {
  return matchesMessagePattern(message, /already\s+exists|duplicate/i);
}

export function isBalanceDefinitionCannotDeleteMessage(message) {
  return matchesMessagePattern(message, /cannot\s+be\s+deleted|being\s+used/i);
}
