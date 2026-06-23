import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP = Object.freeze({
  1: 'Segment Code already exists.',
  20001: 'Segment GUID is required.',
  20002: 'Invalid Segment GUID format.',
  20003: 'Enterprise ID is required.',
  20004: 'Segment Name is required.',
  20005: 'Segment Code is required.',
  20006: 'Invalid Data Type.',
  20007: 'Max Length must be greater than zero.',
  20008: 'Segment Code already exists for this Enterprise.',
  20011: 'Segment not found.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /segment\s*guid\s*is\s*required/i, message: 'Segment GUID is required.' },
  { pattern: /invalid\s*segment\s*guid/i, message: 'Invalid Segment GUID format.' },
  { pattern: /enterprise\s*id\s*is\s*required/i, message: 'Enterprise ID is required.' },
  { pattern: /segment\s*name\s*is\s*required/i, message: 'Segment Name is required.' },
  { pattern: /segment\s*code\s*is\s*required/i, message: 'Segment Code is required.' },
  { pattern: /invalid\s*data\s*type/i, message: 'Invalid Data Type.' },
  { pattern: /max\s*length\s*must\s*be\s*greater/i, message: 'Max Length must be greater than zero.' },
  { pattern: /segment\s*not\s*found/i, message: 'Segment not found.' },
  {
    pattern: /segment\s*code\s*already\s*exists|unique.*segment.*code/i,
    message: 'Segment Code already exists.'
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolveFlexfieldSegmentOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP[errorNum]) {
    return FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP[code]) {
      return FLEXFIELD_SEGMENT_ORACLE_ERROR_MAP[code];
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
export function resolveFlexfieldSegmentUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolveFlexfieldSegmentOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process flexfield segment. Please try again.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }

  return message;
}
