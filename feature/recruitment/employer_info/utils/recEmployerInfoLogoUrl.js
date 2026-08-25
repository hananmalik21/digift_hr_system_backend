/**
 * Public employer logo URLs — relative in mappers; absolute at the HTTP edge.
 * Prefer API_BASE_URL; otherwise derive from the request (proxy-aware).
 */

/**
 * @param {string|undefined|null} value
 * @returns {string|null}
 */
function firstCsvToken(value) {
  if (value == null || value === '') return null;
  const s = String(value);
  return s.includes(',') ? s.split(',')[0].trim() : s.trim();
}

/**
 * @param {import('express').Request|null|undefined} req
 * @returns {string|null}
 */
export function buildPublicApiBaseUrl(req = null) {
  const configured = process.env.API_BASE_URL;
  if (configured && String(configured).trim()) {
    return String(configured).trim().replace(/\/$/, '');
  }

  if (!req || typeof req.get !== 'function') return null;

  const protocol =
    firstCsvToken(req.get('x-forwarded-proto')) || req.protocol || 'http';

  let host =
    firstCsvToken(req.get('x-forwarded-host')) ||
    firstCsvToken(req.get('host'));

  if (!host) {
    host = process.env.NODE_ENV === 'production' ? 'localhost' : 'localhost:3000';
  } else if (host.includes(':3000') && process.env.NODE_ENV === 'production') {
    host = host.replace(':3000', '');
  }

  return `${protocol}://${host}`;
}

/**
 * Deep-linkable path (no host). GET is JWT-free.
 * @param {string} employerInfoGuid
 * @returns {string}
 */
export function employerInfoLogoPath(employerInfoGuid) {
  return `/api/employer-info/${employerInfoGuid}/logo`;
}

/**
 * Absolute when API_BASE_URL or req is available; otherwise relative path.
 * @param {string} employerInfoGuid
 * @param {import('express').Request|null|undefined} [req]
 * @returns {string}
 */
export function buildEmployerInfoLogoUrl(employerInfoGuid, req = null) {
  const path = employerInfoLogoPath(employerInfoGuid);
  const base = buildPublicApiBaseUrl(req);
  return base ? `${base}${path}` : path;
}

/**
 * Rewrite logo_url on mapped employer-info payload(s) for public clients.
 * @param {unknown} data
 * @param {import('express').Request|null|undefined} [req]
 * @returns {unknown}
 */
export function withPublicLogoUrls(data, req = null) {
  if (data == null) return data;
  if (Array.isArray(data)) {
    return data.map((item) => withPublicLogoUrls(item, req));
  }
  if (typeof data !== 'object') return data;

  const guid = data.employer_info_guid;
  if (!guid || data.logo_available !== 'Y') return data;

  return {
    ...data,
    logo_url: buildEmployerInfoLogoUrl(String(guid), req)
  };
}
