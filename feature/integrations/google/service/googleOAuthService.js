import { google } from 'googleapis';
import { AppError } from '../../../../utils/errors/index.js';
import {
  getGoogleOAuthConfig,
  GOOGLE_OAUTH_PROVIDER_CODE,
  GOOGLE_OAUTH_SCOPES,
  isGoogleOAuthConfigured
} from '../../../../config/googleOAuth.js';
import {
  extractGoogleApiError,
  sanitizeGoogleError
} from '../../../../utils/sanitizeGoogleError.js';
import {
  createOAuthStateToken,
  deactivateGoogleIntegration,
  getActiveGoogleIntegration,
  updateGoogleIntegrationTokens,
  upsertGoogleIntegration
} from '../model/googleIntegrationModel.js';
import { consumeOAuthState, saveOAuthState } from '../model/googleOAuthStateModel.js';

const LOG_TAG = 'googleOAuthService';

function createOAuthClient() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new AppError(
      'Google OAuth is not configured on the server.',
      500,
      'GOOGLE_AUTH_START_FAILED',
      'Missing GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, or GOOGLE_REDIRECT_URI'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * @param {{ enterpriseId: number, userId: number }} context
 */
export async function buildGoogleConnectAuthorizationUrl(context) {
  if (!isGoogleOAuthConfigured()) {
    throw new AppError(
      'Google OAuth is not configured on the server.',
      500,
      'GOOGLE_AUTH_START_FAILED'
    );
  }

  const state = createOAuthStateToken();
  await saveOAuthState({
    state_token: state,
    enterprise_id: context.enterpriseId,
    user_id: context.userId,
    provider_code: GOOGLE_OAUTH_PROVIDER_CODE
  });

  const oauth2 = createOAuthClient();
  const { redirectUri } = getGoogleOAuthConfig();
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GOOGLE_OAUTH_SCOPES,
    state,
    redirect_uri: redirectUri
  });

  return { authUrl, state };
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function readQueryString(value) {
  if (value == null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const s = String(raw).trim();
  return s || null;
}

/**
 * @param {{ code?: string|null, state?: string|null, error?: string|null, actor?: string|null }} params
 */
export async function completeGoogleOAuthCallback(params) {
  if (params.error) {
    throw new AppError(
      'Google account authorization was rejected.',
      400,
      'GOOGLE_AUTH_REJECTED',
      String(params.error)
    );
  }

  const code = readQueryString(params.code);
  const state = readQueryString(params.state);

  if (!state) {
    throw new AppError('Invalid Google OAuth callback parameters.', 400, 'GOOGLE_AUTH_FAILED');
  }

  if (!code) {
    throw new AppError(
      'Authorization code is missing. Start again from GET /api/google/connect?format=json and complete Google consent without refreshing this page.',
      400,
      'MISSING_AUTHORIZATION_CODE',
      'Google callback did not include an authorization code parameter.'
    );
  }

  const stateContext = await consumeOAuthState(state);
  if (!stateContext) {
    throw new AppError(
      'Invalid or expired OAuth state. Start Google connect again.',
      400,
      'INVALID_OAUTH_STATE'
    );
  }

  const oauth2 = createOAuthClient();
  const { redirectUri } = getGoogleOAuthConfig();
  let tokens;
  try {
    const tokenResponse = await oauth2.getToken({
      code,
      redirect_uri: redirectUri
    });
    tokens = tokenResponse.tokens;
  } catch (err) {
    const detail = extractGoogleApiError(err);
    console.error(`[${LOG_TAG}] token exchange failed`, detail);
    throw new AppError('Google authorization failed.', 400, 'GOOGLE_AUTH_FAILED', detail);
  }

  oauth2.setCredentials(tokens);
  const googleEmail = await resolveGoogleAccountEmail(oauth2, tokens);

  const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  const existing = await getActiveGoogleIntegration(
    stateContext.enterprise_id,
    stateContext.user_id
  );
  if (!tokens.refresh_token && !existing?.refresh_token) {
    throw new AppError(
      'Google did not return a refresh token. Please reconnect and grant offline access.',
      400,
      'GOOGLE_RECONNECT_REQUIRED'
    );
  }

  await upsertGoogleIntegration({
    enterprise_id: stateContext.enterprise_id,
    user_id: stateContext.user_id,
    google_email: googleEmail,
    access_token: tokens.access_token ?? null,
    refresh_token: tokens.refresh_token ?? null,
    token_expiry_date: expiryDate,
    token_scope: tokens.scope ?? getGoogleOAuthConfig().scope,
    actor: params.actor ?? 'SYSTEM'
  }).catch((err) => {
    console.error(`[${LOG_TAG}] failed to store Google integration`, sanitizeGoogleError(err));
    throw new AppError(
      'Google authorization succeeded but token storage failed.',
      500,
      'GOOGLE_AUTH_FAILED',
      sanitizeGoogleError(err)
    );
  });

  return {
    enterprise_id: stateContext.enterprise_id,
    user_id: stateContext.user_id,
    google_email: googleEmail
  };
}

/**
 * @param {{ enterpriseId: number, userId: number, actor?: string|null }} context
 */
export async function getGoogleOAuthCalendarClient(context) {
  const integration = await getActiveGoogleIntegration(context.enterpriseId, context.userId);
  if (!integration) {
    throw new AppError(
      'Connect your Google account before creating a Google Meet interview.',
      400,
      'GOOGLE_NOT_CONNECTED'
    );
  }

  if (!integration.refresh_token) {
    throw new AppError(
      'Your Google account authorization has expired or been revoked. Please reconnect your Google account.',
      401,
      'GOOGLE_RECONNECT_REQUIRED'
    );
  }

  const oauth2 = createOAuthClient();
  oauth2.setCredentials({
    access_token: integration.access_token ?? undefined,
    refresh_token: integration.refresh_token ?? undefined,
    expiry_date: integration.token_expiry_date?.getTime()
  });

  oauth2.on('tokens', (tokens) => {
    if (!tokens.access_token) return;
    updateGoogleIntegrationTokens(integration.integration_id, {
      access_token: tokens.access_token,
      token_expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      actor: context.actor ?? 'SYSTEM'
    }).catch((err) => {
      console.error(`[${LOG_TAG}] failed to persist refreshed Google token`, sanitizeGoogleError(err));
    });
  });

  try {
    await oauth2.getAccessToken();
  } catch (err) {
    console.error(`[${LOG_TAG}] Google token refresh failed`, sanitizeGoogleError(err));
    await deactivateGoogleIntegration(context.enterpriseId, context.userId, context.actor ?? 'SYSTEM');
    throw new AppError(
      'Your Google account authorization has expired or been revoked. Please reconnect your Google account.',
      401,
      'GOOGLE_RECONNECT_REQUIRED'
    );
  }

  return {
    calendar: google.calendar({ version: 'v3', auth: oauth2 }),
    calendarId: 'primary',
    organizerEmail: integration.google_email
  };
}

/**
 * Disconnect Google for the authenticated user (deactivate stored tokens).
 * @param {{ enterpriseId: number, userId: number, actor?: string|null }} context
 */
export async function disconnectGoogleAccount(context) {
  await deactivateGoogleIntegration(
    context.enterpriseId,
    context.userId,
    context.actor ?? 'SYSTEM'
  );
  return { connected: false };
}

/**
 * @param {import('google-auth-library').OAuth2Client} oauth2
 * @param {import('google-auth-library').Credentials} tokens
 * @returns {Promise<string|null>}
 */
async function resolveGoogleAccountEmail(oauth2, tokens) {
  const fromIdToken = extractEmailFromIdToken(tokens.id_token);
  if (fromIdToken) return fromIdToken;

  try {
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const profile = await oauth2Api.userinfo.get();
    return profile.data?.email ?? null;
  } catch (err) {
    console.warn(
      `[${LOG_TAG}] unable to resolve Google account email`,
      extractGoogleApiError(err)
    );
    return null;
  }
}

/**
 * @param {string|undefined|null} idToken
 * @returns {string|null}
 */
function extractEmailFromIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  const parts = idToken.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : null;
  } catch {
    return null;
  }
}
