import { redactHttpErrorMessage } from '@digifyhr/common';

export function sanitizeGoogleError(err) {
  return redactHttpErrorMessage(err).replace(
    /ya29\.[A-Za-z0-9\-._~+/]+/gi,
    '[REDACTED_ACCESS_TOKEN]'
  );
}

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
