const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /balance\s+(was\s+)?not\s+found/i, message: 'Balance not found.' },
  { pattern: /balance\s*code\s*is\s*required/i, message: 'Balance code is required.' },
  { pattern: /balance\s*name\s*is\s*required/i, message: 'Balance name is required.' },
  {
    pattern: /balance\s*category\s*code\s*is\s*required|invalid\s*balance\s*category/i,
    message: 'Invalid balance category code.'
  },
  {
    pattern: /balance\s*uom\s*code\s*is\s*required|invalid\s*balance\s*uom/i,
    message: 'Invalid balance UOM code.'
  },
  { pattern: /enterprise\s*is\s*required|enterprise\s*is\s*not\s*valid/i, message: 'Enterprise is required.' },
  { pattern: /duplicate.*balance|balance\s*with\s*this\s*code|already\s*exists/i, message: 'A balance with this code already exists.' },
  {
    pattern: /used\s*in\s*balance\s*feed|balance\s*feed/i,
    message: 'Balance cannot be deleted because it is used in balance feeds.'
  },
  { pattern: /invalid\s*status/i, message: 'Invalid status value.' }
]);

const DEFAULT_ERROR_MESSAGE = 'Unable to process payroll balance.';

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return DEFAULT_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return msg;
}

export function isBalanceNotFoundMessage(message) {
  return /balance\s+(was\s+)?not\s+found/i.test(String(message ?? ''));
}

export function isBalanceAlreadyExistsMessage(message) {
  return /already\s+exists|duplicate.*balance|balance\s+with\s+this\s+code/i.test(String(message ?? ''));
}
