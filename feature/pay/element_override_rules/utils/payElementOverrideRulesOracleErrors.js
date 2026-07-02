import { DatabaseError } from '../../../../utils/errors/index.js';

export const OVERRIDE_RULE_ALREADY_EXISTS_MESSAGE =
  'Override rule already exists for this element.';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP = Object.freeze({
  1: OVERRIDE_RULE_ALREADY_EXISTS_MESSAGE,
  20601: 'Override Rule GUID is required.',
  20602: 'Invalid Override Rule GUID format.',
  20603: 'Element is required.',
  20604: 'Approval required code is required.',
  20605: 'Selected element does not exist.',
  20606: 'Override rule not found.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /override\s*rule\s*guid\s*is\s*required/i, message: 'Override Rule GUID is required.' },
  { pattern: /invalid\s*override\s*rule\s*guid/i, message: 'Invalid Override Rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /approval\s*required\s*code\s*is\s*required/i, message: 'Approval required code is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /override\s*rule\s*not\s*found/i, message: 'Override rule not found.' },
  {
    pattern: /override\s*rule\s*already\s*exists|unique.*element_id/i,
    message: OVERRIDE_RULE_ALREADY_EXISTS_MESSAGE
  },
  {
    pattern: /max\s*override\s*percent/i,
    message: 'max_override_percent must be between 0 and 100.'
  },
  {
    pattern: /max\s*override\s*amount/i,
    message: 'max_override_amount cannot be negative.'
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementOverrideRulesOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[code];
    }
  }

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }

  return null;
}

/**
 * @param {string|null|undefined} rawMessage
 * @param {unknown} [oracleError]
 * @returns {string}
 */
export function resolvePayElementOverrideRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementOverrideRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element override rule. Please try again.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }

  return message;
}

/**
 * @param {string|null|undefined} packageMessage
 * @returns {string}
 */
export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element override rule.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_OVERRIDE_RULES_ORACLE_ERROR_MAP[code];
    }
  }

  return msg;
}
