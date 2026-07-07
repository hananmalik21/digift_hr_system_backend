import { DatabaseError } from '../../../../utils/errors/index.js';

const PACKAGE_MESSAGE_MAP = Object.freeze([
  {
    pattern: /eligibility\s*rule\s*guid\s*is\s*required|invalid\s*eligibility\s*rule/i,
    message: 'Invalid Eligibility Rule GUID format.'
  },
  { pattern: /enterprise\s*is\s*required|enterprise\s*is\s*not\s*valid/i, message: 'Enterprise is required.' },
  { pattern: /rule\s*name\s*is\s*required/i, message: 'Rule name is required.' },
  {
    pattern: /criteria\s*type\s*is\s*required|invalid\s*criteria\s*type/i,
    message: 'Invalid criteria type code.'
  },
  {
    pattern: /criteria\s*value\s*is\s*required|at\s*least\s*one\s*criteria/i,
    message: 'At least one criteria value is required.'
  },
  {
    pattern: /duplicate\s*criteria\s*values/i,
    message: 'Duplicate criteria values are not allowed for the same eligibility rule.'
  },
  { pattern: /eligibility\s*rule\s*was\s*not\s*found|not\s*found/i, message: 'Eligibility rule was not found.' },
  { pattern: /grade.*not\s*valid|invalid\s*grade/i, message: 'Selected grade is not valid.' },
  { pattern: /position.*not\s*valid|invalid\s*position/i, message: 'Selected position is not valid.' },
  {
    pattern: /legal\s*employer|business\s*unit|department.*not\s*valid|organization\s*unit/i,
    message: 'Selected organization unit is not valid.'
  },
  {
    pattern: /effective\s*start\s*date/i,
    message: 'Effective start date is required.'
  },
  {
    pattern: /effective\s*end\s*date/i,
    message: 'Effective end date is required.'
  },
  {
    pattern: /created\s*by\s*is\s*required|creation\s*date\s*is\s*required/i,
    message: 'Audit information is required.'
  },
  {
    pattern: /last\s*updated\s*by\s*is\s*required|last\s*update\s*date\s*is\s*required/i,
    message: 'Audit information is required.'
  },
  { pattern: /invalid\s*status/i, message: 'Invalid status value.' }
]);

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return 'Unable to process element eligibility rule.';
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return msg;
}

export function resolvePayElementEligibilityRulesUserMessage(rawMessage, oracleError = null) {
  if (oracleError) {
    const shared = DatabaseError.getUserFriendlyMessage(oracleError);
    if (shared && shared !== 'A database error occurred. Please try again later.') return shared;
  }
  return mapPackageBusinessMessage(rawMessage);
}
