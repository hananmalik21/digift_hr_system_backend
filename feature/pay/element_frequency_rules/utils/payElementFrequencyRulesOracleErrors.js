import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_FREQUENCY_RULES_ORACLE_ERROR_MAP = Object.freeze({
  20801: 'Frequency rule GUID is required.',
  20802: 'Invalid frequency rule GUID format.',
  20803: 'Element is required.',
  20805: 'Selected element does not exist.',
  20806: 'Frequency rule already exists for this element.',
  20812: 'Payload JSON is required.'
});

export const FREQUENCY_RULE_ALREADY_EXISTS_MESSAGE =
  'Frequency rule already exists for this element.';

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /frequency\s*rule\s*guid\s*is\s*required/i, message: 'Frequency rule GUID is required.' },
  { pattern: /invalid\s*frequency\s*rule\s*guid/i, message: 'Invalid frequency rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  {
    pattern: /frequency\s*rule\s*already\s*exists/i,
    message: FREQUENCY_RULE_ALREADY_EXISTS_MESSAGE
  },
  { pattern: /frequency\s*rule\s*not\s*found/i, message: 'Frequency rule not found.' }
]);

export function resolvePayElementFrequencyRulesOracleMessage(oracleError) {
  if (!oracleError) return null;
  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_FREQUENCY_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_FREQUENCY_RULES_ORACLE_ERROR_MAP[errorNum];
  }
  const message = String(oracleError.message ?? '');
  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_FREQUENCY_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_FREQUENCY_RULES_ORACLE_ERROR_MAP[code];
    }
  }
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return null;
}

export function resolvePayElementFrequencyRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementFrequencyRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;
  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') return shared;
  }
  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element frequency rule. Please try again.';
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element frequency rule.';
  const stripped = msg.replace(/^ORA-\d+:\s*/i, '');
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(stripped) || pattern.test(msg)) return friendly;
  }
  return stripped || msg;
}
