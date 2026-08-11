import { DatabaseError } from '../../../../utils/errors/index.js';

export const PROCESSING_RULE_ALREADY_EXISTS_MESSAGE =
  'Processing rule already exists for this element.';

export const FORMULA_ENTERPRISE_MISMATCH_MESSAGE =
  'Selected formula does not exist or does not belong to the same enterprise as the element.';

export const PROCESSING_RULE_NOT_FOUND_MESSAGE = 'Processing rule not found.';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_PROCESSING_RULES_ORACLE_ERROR_MAP = Object.freeze({
  1: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE,
  20301: 'Processing Rule GUID is required.',
  20302: 'Invalid Processing Rule GUID format.',
  20303: 'Element is required.',
  20304: 'Processing type code is required.',
  20305: 'Effective start date is required.',
  20306: 'Selected element does not exist.',
  20307: PROCESSING_RULE_NOT_FOUND_MESSAGE
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /processing\s*rule\s*guid\s*is\s*required/i, message: 'Processing Rule GUID is required.' },
  { pattern: /invalid\s*processing\s*rule\s*guid/i, message: 'Invalid Processing Rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /processing\s*type\s*code\s*is\s*required/i, message: 'Processing type code is required.' },
  { pattern: /effective\s*start\s*date\s*is\s*required/i, message: 'Effective start date is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /processing\s*rule\s*not\s*found/i, message: PROCESSING_RULE_NOT_FOUND_MESSAGE },
  {
    pattern: /processing\s*rule\s*already\s*exists|unique.*element_id/i,
    message: PROCESSING_RULE_ALREADY_EXISTS_MESSAGE
  },
  {
    pattern: /invalid\s*processing\s*type/i,
    message:
      'processing_type_code must be one of: RECURRING, NONRECURRING, INDIRECT, ONCE_EACH_PERIOD.'
  },
  {
    pattern:
      /formula\s*does\s*not\s*exist|formula.*same\s*enterprise|does\s*not\s*belong\s*to\s*the\s*same\s*enterprise.*formula|selected\s*formula|invalid\s*formula/i,
    message: FORMULA_ENTERPRISE_MISMATCH_MESSAGE
  }
]);

function matchPackageMessage(message) {
  const text = String(message ?? '');
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(text)) return friendly;
  }
  return null;
}

function messageFromOracleCode(code) {
  const n = Number(code);
  return Number.isFinite(n) ? PAY_ELEMENT_PROCESSING_RULES_ORACLE_ERROR_MAP[n] ?? null : null;
}

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementProcessingRulesOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  const fromCode = messageFromOracleCode(errorNum);
  if (fromCode) return fromCode;

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return PAY_ELEMENT_PROCESSING_RULES_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const mapped = messageFromOracleCode(oraMatch[1]);
    if (mapped) return mapped;
  }

  return matchPackageMessage(message);
}

/**
 * @param {string|null|undefined} rawMessage
 * @param {unknown} [oracleError]
 * @returns {string}
 */
export function resolvePayElementProcessingRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementProcessingRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element processing rule. Please try again.';

  return matchPackageMessage(message) || message;
}

/**
 * @param {string|null|undefined} packageMessage
 * @returns {string}
 */
export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element processing rule.';

  const matched = matchPackageMessage(msg);
  if (matched) return matched;

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const mapped = messageFromOracleCode(oraMatch[1]);
    if (mapped) return mapped;
  }

  return msg;
}

/**
 * @param {string} message
 * @returns {boolean}
 */
export function isProcessingRuleNotFoundMessage(message) {
  return /processing\s*rule\s*not\s*found/i.test(String(message ?? ''));
}
