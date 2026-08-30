const CALENDAR_EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const USERINFO_EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

export const GOOGLE_OAUTH_SCOPES = [CALENDAR_EVENTS_SCOPE, USERINFO_EMAIL_SCOPE];

export const GOOGLE_OAUTH_PROVIDER_CODE = 'GOOGLE';

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const configuredRedirect = process.env.GOOGLE_REDIRECT_URI?.trim();

  if (process.env.NODE_ENV === 'production' && !configuredRedirect) {
    throw new Error('GOOGLE_REDIRECT_URI is required when NODE_ENV=production');
  }

  const redirectUri =
    configuredRedirect || 'http://localhost:3000/api/google/callback';

  return {
    clientId,
    clientSecret,
    redirectUri,
    scopes: GOOGLE_OAUTH_SCOPES,
    scope: GOOGLE_OAUTH_SCOPES.join(' ')
  };
}

export function isGoogleOAuthConfigured() {
  try {
    const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
    return Boolean(clientId && clientSecret && redirectUri);
  } catch {
    return false;
  }
}
