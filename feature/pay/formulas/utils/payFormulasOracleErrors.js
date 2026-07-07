const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /formula\s+(was\s+)?not\s+found/i, message: 'Formula not found.' },
  { pattern: /formula\s*code\s*is\s*required/i, message: 'Formula code is required.' },
  { pattern: /formula\s*name\s*is\s*required/i, message: 'Formula name is required.' },
  { pattern: /formula\s*type\s*code\s*is\s*required/i, message: 'Formula type code is required.' },
  { pattern: /enterprise\s*is\s*required|enterprise\s*is\s*not\s*valid/i, message: 'Enterprise is required.' },
  { pattern: /duplicate.*formula|formula\s*with\s*this\s*code/i, message: 'A formula with this code already exists.' },
  { pattern: /invalid\s*formula\s*type/i, message: 'Invalid formula type code.' },
  { pattern: /invalid\s*formula\s*engine/i, message: 'Invalid formula engine code.' },
  { pattern: /invalid\s*return\s*type/i, message: 'Invalid return type code.' },
  { pattern: /invalid\s*status/i, message: 'Invalid status value.' }
]);

const DEFAULT_ERROR_MESSAGE = 'Unable to process payroll formula.';

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return DEFAULT_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return msg;
}

export function isFormulaNotFoundMessage(message) {
  return /formula\s+(was\s+)?not\s+found/i.test(String(message ?? ''));
}
