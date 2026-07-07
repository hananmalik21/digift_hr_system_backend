const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /profile\s*name\s*is\s*required/i, message: 'Profile name is required.' },
  { pattern: /profile\s*was\s*not\s*found/i, message: 'Profile was not found.' },
  {
    pattern: /selected\s*profile\s*is\s*not\s*valid/i,
    message: 'Selected profile is not valid for this enterprise.'
  },
  {
    pattern: /selected\s*element\s*is\s*not\s*valid/i,
    message: 'Selected element is not valid for this enterprise.'
  },
  { pattern: /duplicate.*profile|profile\s*with\s*this\s*name/i, message: 'A profile with this name already exists.' },
  {
    pattern: /duplicate\s*eligibility\s*rules/i,
    message: 'Duplicate eligibility rules are not allowed in the same profile.'
  },
  {
    pattern: /at\s*least\s*one\s*eligibility\s*rule/i,
    message: 'At least one eligibility rule is required.'
  },
  {
    pattern: /eligibility\s*rule.*not\s*valid|invalid\s*eligibility\s*rule/i,
    message: 'Selected eligibility rule is not valid for this enterprise.'
  },
  {
    pattern: /already\s*linked/i,
    message: 'This profile is already linked with this element.'
  },
  {
    pattern: /profile\s*element\s*link\s*was\s*not\s*found/i,
    message: 'Profile element link was not found.'
  },
  {
    pattern: /invalid\s*profile/i,
    message: 'Invalid profile. Please select a valid value from the list.'
  },
  {
    pattern: /invalid\s*element/i,
    message: 'Invalid element. Please select a valid value from the list.'
  },
  { pattern: /enterprise\s*is\s*required|enterprise\s*is\s*not\s*valid/i, message: 'Enterprise is required.' },
  { pattern: /invalid\s*status/i, message: 'Invalid status value.' },
  {
    pattern: /created\s*by|creation\s*date|last\s*updated\s*by|last\s*update\s*date|audit/i,
    message: 'Audit information is required.'
  },
  { pattern: /invalid.*json/i, message: 'Invalid eligibility rules JSON.' }
]);

const DEFAULT_ERROR_MESSAGE = 'Unable to process element eligibility profile.';

function mapByPatterns(packageMessage, fallback) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return fallback;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return msg;
}

export function mapPackageBusinessMessage(packageMessage) {
  return mapByPatterns(packageMessage, DEFAULT_ERROR_MESSAGE);
}

export function mapProfileElementPackageMessage(packageMessage) {
  return mapByPatterns(packageMessage, 'Unable to process profile element link.');
}
