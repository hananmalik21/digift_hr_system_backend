import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_PRORATION_RULES_ORACLE_ERROR_MAP = Object.freeze({
  20001: 'Proration rule GUID is required.',
  20002: 'Invalid proration rule GUID format.',
  20010: 'Payload JSON is required.',
  20011: 'Element is required.'
});

export const PRORATION_RULE_ALREADY_EXISTS_MESSAGE =
  'Proration rule already exists for this element.';

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /proration\s*rule\s*guid\s*is\s*required/i, message: 'Proration rule GUID is required.' },
  { pattern: /invalid\s*proration\s*rule\s*guid/i, message: 'Invalid proration rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  {
    pattern: /proration\s*rule\s*already\s*exists/i,
    message: PRORATION_RULE_ALREADY_EXISTS_MESSAGE
  },
  { pattern: /proration\s*rule\s*not\s*found/i, message: 'Proration rule not found.' }
]);

export function resolvePayElementProrationRulesOracleMessage(oracleError) {
  if (!oracleError) return null;
  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_PRORATION_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_PRORATION_RULES_ORACLE_ERROR_MAP[errorNum];
  }
  const message = String(oracleError.message ?? '');
  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_PRORATION_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_PRORATION_RULES_ORACLE_ERROR_MAP[code];
    }
  }
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return null;
}

export function resolvePayElementProrationRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementProrationRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;
  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') return shared;
  }
  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element proration rule. Please try again.';
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element proration rule.';
  const stripped = msg.replace(/^ORA-\d+:\s*/i, '');
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(stripped) || pattern.test(msg)) return friendly;
  }
  return stripped || msg;
}
