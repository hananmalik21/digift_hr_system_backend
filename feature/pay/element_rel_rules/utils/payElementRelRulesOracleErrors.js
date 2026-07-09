import { DatabaseError } from '../../../../utils/errors/index.js';

/** @type {Record<number, string>} */
export const PAY_ELEMENT_REL_RULES_ORACLE_ERROR_MAP = Object.freeze({
  21001: 'Element is required.',
  21002: 'Enterprise is required.',
  21003: 'Scope configuration code is required.',
  21004:
    'scope_configuration_code must be one of: ASSIGNMENT_LEVEL, PAYROLL_RELATIONSHIP_LEVEL, LEGAL_EMPLOYER_LEVEL, ENTERPRISE_LEVEL.',
  21005: 'active_flag must be Y or N.',
  21006: 'Selected element does not exist for this enterprise.',
  21007: 'Rule GUID is required.',
  21008: 'Invalid rule GUID format.',
  21009: 'Relationship rule not found.',
  21010: 'An active relationship rule already exists for the same element and scope filters.',
  21011: 'Invalid organization unit GUID format.',
  21012: 'Selected organization unit does not exist.',
  21013: 'Selected grade does not exist.',
  21014: 'Invalid position GUID format.',
  21015: 'Selected position does not exist.',
  21016: 'hard_delete must be Y or N.'
});

const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /element\s*is\s*required/i, message: 'Element is required.' },
  { pattern: /enterprise\s*is\s*required/i, message: 'Enterprise is required.' },
  {
    pattern: /scope\s*configuration\s*code\s*is\s*required/i,
    message: 'Scope configuration code is required.'
  },
  {
    pattern: /invalid\s*scope\s*configuration|scope_configuration_code/i,
    message:
      'scope_configuration_code must be one of: ASSIGNMENT_LEVEL, PAYROLL_RELATIONSHIP_LEVEL, LEGAL_EMPLOYER_LEVEL, ENTERPRISE_LEVEL.'
  },
  { pattern: /active_flag\s*must\s*be\s*y\s*or\s*n/i, message: 'active_flag must be Y or N.' },
  {
    pattern: /element\s*does\s*not\s*exist|selected\s*element\s*does\s*not\s*exist/i,
    message: 'Selected element does not exist for this enterprise.'
  },
  { pattern: /rule\s*guid\s*is\s*required/i, message: 'Rule GUID is required.' },
  { pattern: /invalid\s*rule\s*guid/i, message: 'Invalid rule GUID format.' },
  { pattern: /relationship\s*rule\s*not\s*found|rule\s*not\s*found/i, message: 'Relationship rule not found.' },
  {
    pattern: /duplicate|already\s*exists/i,
    message: 'An active relationship rule already exists for the same element and scope filters.'
  },
  {
    pattern: /invalid\s*organization\s*unit|org_unit/i,
    message: 'Invalid organization unit GUID format.'
  },
  {
    pattern: /selected\s*organization\s*unit\s*does\s*not\s*exist/i,
    message: 'Selected organization unit does not exist.'
  },
  { pattern: /selected\s*grade\s*does\s*not\s*exist/i, message: 'Selected grade does not exist.' },
  { pattern: /invalid\s*position/i, message: 'Invalid position GUID format.' },
  { pattern: /selected\s*position\s*does\s*not\s*exist/i, message: 'Selected position does not exist.' },
  { pattern: /hard_delete\s*must\s*be/i, message: 'hard_delete must be Y or N.' }
]);

export function resolvePayElementRelRulesOracleMessage(oracleError) {
  if (!oracleError) return null;
  const errorNum = Number(oracleError.errorNum);
  if (Number.isFinite(errorNum) && PAY_ELEMENT_REL_RULES_ORACLE_ERROR_MAP[errorNum]) {
    return PAY_ELEMENT_REL_RULES_ORACLE_ERROR_MAP[errorNum];
  }
  const message = String(oracleError.message ?? '');
  const oraMatch = message.match(/ORA-(\d{5})/i);
  if (oraMatch) {
    const code = Number(oraMatch[1]);
    if (PAY_ELEMENT_REL_RULES_ORACLE_ERROR_MAP[code]) {
      return PAY_ELEMENT_REL_RULES_ORACLE_ERROR_MAP[code];
    }
  }
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return null;
}

export function resolvePayElementRelRulesUserMessage(rawMessage, oracleError = null) {
  const fromOracle = resolvePayElementRelRulesOracleMessage(oracleError);
  if (fromOracle) return fromOracle;
  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') return shared;
  }
  const message = String(rawMessage ?? '').trim();
  if (!message) return 'Unable to process element relationship rule. Please try again.';
  for (const { pattern, message: friendly } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(message)) return friendly;
  }
  return message;
}
