import { DatabaseError } from '../../../../utils/errors/index.js';

export const RETRO_RULE_ALREADY_EXISTS_MESSAGE = 'Retro rule already exists for this element.';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP = Object.freeze({
  1: RETRO_RULE_ALREADY_EXISTS_MESSAGE,
  20501: 'Retro Rule GUID is required.',
  20502: 'Invalid Retro Rule GUID format.',
  20503: 'Element is required.',
  20504: 'Selected element does not exist.',
  20505: 'Retro rule not found.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /retro\s*rule\s*guid\s*is\s*required/i, message: 'Retro Rule GUID is required.' },
  { pattern: /invalid\s*retro\s*rule\s*guid/i, message: 'Invalid Retro Rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /retro\s*rule\s*not\s*found/i, message: 'Retro rule not found.' },
  {
    pattern: /retro\s*rule\s*already\s*exists|unique.*element_id/i,
    message: RETRO_RULE_ALREADY_EXISTS_MESSAGE
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementRetroRulesOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[code];
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
export function resolvePayElementRetroRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementRetroRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element retro rule. Please try again.';

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
  if (!msg) return 'Unable to process element retro rule.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_RETRO_RULES_ORACLE_ERROR_MAP[code];
    }
  }

  return msg;
}
