import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP = Object.freeze({
  1: 'Input value name already exists for this element.',
  20201: 'Input Value GUID is required.',
  20202: 'Invalid Input Value GUID format.',
  20203: 'Element is required.',
  20204: 'Input value name is required.',
  20205: 'Data type code is required.',
  20206: 'Selected element does not exist.',
  20207: 'Input value not found.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /input\s*value\s*guid\s*is\s*required/i, message: 'Input Value GUID is required.' },
  { pattern: /invalid\s*input\s*value\s*guid/i, message: 'Invalid Input Value GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /input\s*value\s*name\s*is\s*required/i, message: 'Input value name is required.' },
  { pattern: /data\s*type\s*code\s*is\s*required/i, message: 'Data type code is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /input\s*value\s*not\s*found/i, message: 'Input value not found.' },
  {
    pattern: /input\s*value\s*name\s*already\s*exists|unique.*input.*value/i,
    message: 'Input value name already exists for this element.'
  },
  {
    pattern: /invalid\s*data\s*type/i,
    message: 'data_type_code must be one of: TEXT, NUMBER, MONEY, DATE, BOOLEAN, PERCENTAGE, LOOKUP.'
  }
]);

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementInputValuesOracleMessage(oracleError) {
  if (!oracleError) return null;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');

  if (errorNum === 1 || message.includes('ORA-00001')) {
    return PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[1];
  }

  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[code];
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
export function resolvePayElementInputValuesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementInputValuesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element input value. Please try again.';

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
  if (!msg) return 'Unable to process element input value.';

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_INPUT_VALUES_ORACLE_ERROR_MAP[code];
    }
  }

  return msg;
}
