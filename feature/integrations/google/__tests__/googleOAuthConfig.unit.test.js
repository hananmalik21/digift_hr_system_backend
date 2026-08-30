/**
 * Unit tests for Google OAuth configuration helpers.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  getGoogleOAuthConfig,
  isGoogleOAuthConfigured
} from '../../../../config/googleOAuth.js';

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'NODE_ENV'];

function clearGoogleEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('google OAuth config', () => {
  afterEach(clearGoogleEnv);

  it('reports not configured when client credentials are missing', () => {
    assert.equal(isGoogleOAuthConfigured(), false);
  });

  it('uses development redirect URI by default', () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    const config = getGoogleOAuthConfig();
    assert.equal(config.redirectUri, 'http://localhost:3000/api/google/callback');
    assert.deepEqual(config.scopes, [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email'
    ]);
    assert.equal(isGoogleOAuthConfigured(), true);
  });

  it('requires explicit redirect URI in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    assert.throws(() => getGoogleOAuthConfig(), /GOOGLE_REDIRECT_URI is required/);
    assert.equal(isGoogleOAuthConfigured(), false);

    process.env.GOOGLE_REDIRECT_URI = 'https://api.digifyhr.com/api/google/callback';
    const config = getGoogleOAuthConfig();
    assert.equal(config.redirectUri, 'https://api.digifyhr.com/api/google/callback');
    assert.equal(isGoogleOAuthConfigured(), true);
  });
});
