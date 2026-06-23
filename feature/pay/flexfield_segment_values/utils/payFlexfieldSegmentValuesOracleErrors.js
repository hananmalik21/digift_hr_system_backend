import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP = Object.freeze({
  1: 'Value Code already exists for this Segment.',
  20101: 'Segment Value GUID is required.',
  20102: 'Invalid Segment Value GUID format.',
  20108: 'Selected segment does not exist.'
});

export const SEGMENT_CODE_NOT_FOUND_MESSAGE = 'Segment code does not exist.';

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /segment\s*value\s*guid\s*is\s*required/i, message: 'Segment Value GUID is required.' },
  { pattern: /invalid\s*segment\s*value\s*guid/i, message: 'Invalid Segment Value GUID format.' },
  { pattern: /selected\s*segment\s*does\s*not\s*exist/i, message: 'Selected segment does not exist.' },
  { pattern: /segment\s*code\s*does\s*not\s*exist/i, message: SEGMENT_CODE_NOT_FOUND_MESSAGE },
  {
    pattern: /value\s*code\s*already\s*exists|unique.*value.*code/i,
    message: 'Value Code already exists for this Segment.'
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolveFlexfieldSegmentValueOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP[errorNum]) {
    return FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP[code]) {
      return FLEXFIELD_SEGMENT_VALUE_ORACLE_ERROR_MAP[code];
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
export function resolveFlexfieldSegmentValueUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolveFlexfieldSegmentValueOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process flexfield segment value. Please try again.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }

  return message;
}
