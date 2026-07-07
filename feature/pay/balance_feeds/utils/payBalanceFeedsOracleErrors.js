const PACKAGE_MESSAGE_MAP = Object.freeze([
  { pattern: /balance\s+feed\s+(was\s+)?not\s+found/i, message: 'Balance feed not found.' },
  { pattern: /feed\s+type\s+code\s+is\s+required|invalid\s+feed\s+type/i, message: 'Invalid feed type code.' },
  { pattern: /element\s+id\s+is\s+required|invalid\s+element/i, message: 'Invalid element.' },
  {
    pattern: /target\s+balance\s+id\s+is\s+required|invalid\s+target\s+balance/i,
    message: 'Invalid target balance.'
  },
  {
    pattern: /feed\s+direction\s+code\s+is\s+required|invalid\s+feed\s+direction/i,
    message: 'Invalid feed direction code.'
  },
  {
    pattern: /input\s+value\s+code\s+is\s+required|invalid\s+input\s+value/i,
    message: 'Invalid input value code.'
  },
  {
    pattern: /classification\s+code\s+is\s+required|invalid\s+classification/i,
    message: 'Invalid classification code.'
  },
  { pattern: /formula\s+id\s+is\s+required|invalid\s+formula/i, message: 'Invalid formula.' },
  { pattern: /enterprise\s*is\s*required|enterprise\s*is\s*not\s*valid/i, message: 'Enterprise is required.' },
  {
    pattern: /duplicate|already\s+exists|overlapping/i,
    message: 'A balance feed with these details already exists.'
  },
  { pattern: /invalid\s*status/i, message: 'Invalid status value.' },
  {
    pattern: /effective\s+start\s+date|effective\s+end\s+date/i,
    message: 'Invalid effective date range.'
  }
]);

const DEFAULT_ERROR_MESSAGE = 'Unable to process balance feed.';

export function mapPackageBusinessMessage(packageMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return DEFAULT_ERROR_MESSAGE;
  for (const { pattern, message } of PACKAGE_MESSAGE_MAP) {
    if (pattern.test(msg)) return message;
  }
  return msg;
}

export function isBalanceFeedNotFoundMessage(message) {
  return /balance\s+feed\s+(was\s+)?not\s+found/i.test(String(message ?? ''));
}

export function isBalanceFeedAlreadyExistsMessage(message) {
  return /already\s+exists|duplicate|overlapping/i.test(String(message ?? ''));
}
