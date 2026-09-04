import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP = Object.freeze({
  20001: 'GUID is required.',
  20002: 'Invalid GUID format.',
  20011: 'Enterprise is required.',
  20012: 'Employee is required.',
  20013: 'Element is required.',
  20016: 'Effective As-Of Date is required.',
  20017: 'Effective Start Date is required.',
  20018: 'Employee does not belong to selected enterprise.',
  20019: 'Selected element does not belong to selected enterprise.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /guid\s*is\s*required/i, message: 'GUID is required.' },
  { pattern: /invalid\s*guid/i, message: 'Invalid GUID format.' },
  { pattern: /enterprise\s*is\s*required|enterprise\s*id\s*is\s*required/i, message: 'Enterprise is required.' },
  { pattern: /employee\s*is\s*required/i, message: 'Employee is required.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  {
    pattern: /effective\s*as-?of\s*date\s*is\s*required/i,
    message: 'Effective As-Of Date is required.'
  },
  {
    pattern: /effective\s*start\s*date\s*is\s*required/i,
    message: 'Effective Start Date is required.'
  },
  {
    pattern: /employee\s*does\s*not\s*belong/i,
    message: 'Employee does not belong to selected enterprise.'
  },
  {
    pattern: /element\s*does\s*not\s*belong/i,
    message: 'Selected element does not belong to selected enterprise.'
  },
  { pattern: /element\s*entry\s*not\s*found/i, message: 'Element entry not found.' }
]);

function extractOracleRunTypeMessage(text) {
  const message = String(text ?? '');
  if (!/run[_\s-]?type/i.test(message)) return null;
  const cleaned = message.replace(/^ORA-\d{5}:\s*/i, '').split(/\n/)[0].trim();
  return cleaned || null;
}

/**
 * @param {unknown} oracleError
 * @returns {string|null}
 */
export function resolvePayElementEntriesOracleMessage(oracleError) {
  if (!oracleError) return null;

  const runTypeMessage = extractOracleRunTypeMessage(oracleError.message);
  if (runTypeMessage) return runTypeMessage;

  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[errorNum];
  }

  const message = String(oracleError.message ?? '');
  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[code];
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
export function resolvePayElementEntriesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementEntriesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;

  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') {
      return shared;
    }
  }

  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element entry. Please try again.';

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
  if (!msg) return 'Unable to process element entry.';

  const runTypeMessage = extractOracleRunTypeMessage(msg);
  if (runTypeMessage) return runTypeMessage;

  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }

  const oraMatch = msg.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_ENTRIES_ORACLE_ERROR_MAP[code];
    }
  }

  return msg;
}
