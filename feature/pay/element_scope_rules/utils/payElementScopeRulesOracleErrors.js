import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_SCOPE_RULES_ORACLE_ERROR_MAP = Object.freeze({
  20701: 'Scope Rule GUID is required.',
  20702: 'Invalid Scope Rule GUID format.',
  20703: 'Element is required.',
  20704: 'Scope level code is required.',
  20705: 'Selected element does not exist.',
  20706: 'Scope rule not found.',
  20707: 'Selected payroll does not exist.',
  20708: 'Selected legal employer does not exist.',
  20709: 'Selected organization unit does not exist.',
  20710: 'Selected grade does not exist.',
  20711: 'Selected position does not exist.',
  20712: 'Payload JSON is required.',
  20713:
    'scope_level_code must be one of: ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /scope\s*rule\s*guid\s*is\s*required/i, message: 'Scope Rule GUID is required.' },
  { pattern: /invalid\s*scope\s*rule\s*guid/i, message: 'Invalid Scope Rule GUID format.' },
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /scope\s*level\s*code\s*is\s*required/i, message: 'Scope level code is required.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist.'
  },
  { pattern: /scope\s*rule\s*not\s*found/i, message: 'Scope rule not found.' },
  { pattern: /selected\s*payroll\s*does\s*not\s*exist/i, message: 'Selected payroll does not exist.' },
  {
    pattern: /selected\s*legal\s*employer\s*does\s*not\s*exist/i,
    message: 'Selected legal employer does not exist.'
  },
  {
    pattern: /selected\s*organization\s*unit\s*does\s*not\s*exist/i,
    message: 'Selected organization unit does not exist.'
  },
  { pattern: /selected\s*position\s*does\s*not\s*exist/i, message: 'Selected position does not exist.' },
  {
    pattern: /invalid\s*scope\s*level/i,
    message: 'scope_level_code must be one of: ASSIGNMENT, PAYROLL_RELATIONSHIP, LEGAL_EMPLOYER, ENTERPRISE.'
  },
  { pattern: /grade.*does\s*not\s*exist/i, message: 'Selected grade does not exist.' }
]);

export function resolvePayElementScopeRulesOracleMessage(oracleError) {
  if (!oracleError) return null;
  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_SCOPE_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_SCOPE_RULES_ORACLE_ERROR_MAP[errorNum];
  }
  const message = String(oracleError.message ?? '');
  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_SCOPE_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_SCOPE_RULES_ORACLE_ERROR_MAP[code];
    }
  }
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return null;
}

export function resolvePayElementScopeRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementScopeRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;
  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') return shared;
  }
  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element scope rule. Please try again.';
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element scope rule.';
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return friendly;
  }
  return msg;
}
