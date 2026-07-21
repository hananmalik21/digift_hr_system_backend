const TECHNICAL_MESSAGE_PATTERN = /ORA-|PL\/SQL|SQL statement|constraint|PAY\.|stack trace/i;

export function sanitizePackageBusinessMessage(packageMessage, defaultMessage) {
  const msg = String(packageMessage ?? '').trim();
  if (!msg) return defaultMessage;
  if (TECHNICAL_MESSAGE_PATTERN.test(msg)) return defaultMessage;
  return msg;
}

export function matchesMessagePattern(message, pattern) {
  return pattern.test(String(message ?? ''));
}
