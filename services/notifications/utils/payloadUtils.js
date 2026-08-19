/**
 * Firebase Cloud Messaging requires all custom data payload values to be strings.
 */
export function stringifyNotificationData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      continue;
    }
    result[key] = String(value);
  }
  return result;
}

/**
 * Build an absolute web notification link from a relative action path.
 * Only application-relative paths starting with "/" are permitted.
 */
export function buildWebPushLink(actionUrl) {
  if (actionUrl == null || actionUrl === '') {
    return undefined;
  }

  const path = String(actionUrl).trim();
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error('actionUrl must be an application-relative path starting with "/"');
  }

  const baseUrl = process.env.DIGIFYHR_WEB_URL;
  if (!baseUrl || !String(baseUrl).trim()) {
    throw new Error(
      'DIGIFYHR_WEB_URL environment variable is required when actionUrl is provided'
    );
  }

  const normalizedBase = String(baseUrl).trim().replace(/\/+$/, '');
  return `${normalizedBase}${path}`;
}

export function maskRegistrationToken(token) {
  if (token == null || token === '') {
    return '***';
  }

  const value = String(token);
  if (value.length <= 12) {
    return '***';
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}
