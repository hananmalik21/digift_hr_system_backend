/**
 * Redact bearer / Google access tokens from error messages before logging.
 * @param {unknown} err
 * @returns {string}
 */
export function sanitizeGoogleError(err) {
  const message = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/ya29\.[A-Za-z0-9\-._~+/]+/gi, '[REDACTED_ACCESS_TOKEN]')
    .slice(0, 500);
}

/**
 * Prefer Google API error code/description when present.
 * @param {unknown} err
 * @returns {string}
 */
export function extractGoogleApiError(err) {
  const data = err?.response?.data;
  if (data && typeof data === 'object') {
    const code = data.error ?? data.error_code;
    const desc = data.error_description ?? data.error_message;
    if (code) {
      return `${code}${desc ? `: ${desc}` : ''}`;
    }
  }
  return sanitizeGoogleError(err);
}
