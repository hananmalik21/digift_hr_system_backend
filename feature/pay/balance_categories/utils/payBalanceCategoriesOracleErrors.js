import {
  matchesMessagePattern,
  sanitizePackageBusinessMessage
} from '../../utils/payPackageMessageUtils.js';

const DEFAULT_ERROR_MESSAGE = 'Unable to process balance category.';

export function mapPackageBusinessMessage(packageMessage) {
  return sanitizePackageBusinessMessage(packageMessage, DEFAULT_ERROR_MESSAGE);
}

export function isBalanceCategoryNotFoundMessage(message) {
  return matchesMessagePattern(message, /does\s+not\s+exist|not\s+found/i);
}

export function isBalanceCategoryAlreadyExistsMessage(message) {
  return matchesMessagePattern(message, /already\s+exists|duplicate/i);
}

export function isBalanceCategoryCannotDeleteMessage(message) {
  return matchesMessagePattern(message, /cannot\s+be\s+deleted|one\s+or\s+more\s+balance/i);
}
