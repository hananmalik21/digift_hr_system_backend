import { DatabaseError } from '../../../../utils/errors/index.js';

export const ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE =
  'Entry controls already exist for this element.';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP = Object.freeze({
  1: ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE,
  20401: 'Entry Control GUID is required.',
  20402: 'Invalid Entry Control GUID format.',
  20403: 'Element is required.',
  20404: 'Max entries allowed is required.',
  20405: 'Selected element does not exist.',
  20406: 'Entry controls not found.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /entry\s*control\s*guid\s*is\s*required/i, message: 'Entry Control GUID is required.' },
  { pattern: /invalid\s*entry\s*control\s*guid/i, message: 'Invalid Entry Control GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /max\s*entries\s*allowed\s*is\s*required/i, message: 'Max entries allowed is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /entry\s*controls?\s*not\s*found/i, message: 'Entry controls not found.' },
  {
    pattern: /entry\s*controls?\s*already\s*exist|unique.*element_id/i,
    message: ENTRY_CONTROL_ALREADY_EXISTS_MESSAGE
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementEntryControlsOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[code];
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
export function resolvePayElementEntryControlsUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementEntryControlsOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element entry controls. Please try again.';

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
  if (!msg) return 'Unable to process element entry controls.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_ENTRY_CONTROLS_ORACLE_ERROR_MAP[code];
    }
  }

  return msg;
}
