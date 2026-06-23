import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENTS_ORACLE_ERROR_MAP = Object.freeze({
  20203: 'Enterprise ID is required.',
  20204: 'Element Code is required.',
  20205: 'Element Name is required.',
  20207: 'Element Code already exists.',
  20208: 'Element not found.',
  20220: 'Invalid costing JSON.',
  20222: 'Segment ID required.',
  20223: 'Segment Value ID required.',
  20224: 'Segment Value does not belong to Segment.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /enterprise\s*id\s*is\s*required/i, message: 'Enterprise ID is required.' },
  { pattern: /element\s*code\s*is\s*required/i, message: 'Element Code is required.' },
  { pattern: /element\s*name\s*is\s*required/i, message: 'Element Name is required.' },
  { pattern: /element\s*code\s*already\s*exists/i, message: 'Element Code already exists.' },
  { pattern: /element\s*not\s*found/i, message: 'Element not found.' },
  { pattern: /invalid\s*costing\s*json/i, message: 'Invalid costing JSON.' },
  { pattern: /segment\s*id\s*required/i, message: 'Segment ID required.' },
  { pattern: /segment\s*value\s*id\s*required/i, message: 'Segment Value ID required.' },
  {
    pattern: /segment\s*value\s*does\s*not\s*belong\s*to\s*segment/i,
    message: 'Segment Value does not belong to Segment.'
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementsOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENTS_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENTS_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENTS_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENTS_ORACLE_ERROR_MAP[code];
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
export function resolvePayElementsUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementsOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process pay element. Please try again.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }

  return message;
}
