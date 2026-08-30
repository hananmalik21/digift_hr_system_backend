/**
 * Unit tests for OAuth token encryption helpers.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { decryptSecret, encryptSecret } from '../tokenEncryption.js';

const ENV_KEYS = ['GOOGLE_TOKEN_ENCRYPTION_KEY', 'JWT_SECRET', 'NODE_ENV'];

function clearEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe('tokenEncryption', () => {
  afterEach(clearEnv);

  it('round-trips secrets with GOOGLE_TOKEN_ENCRYPTION_KEY', () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-google-token-key';
    const cipher = encryptSecret('ya29.access-token-value');
    assert.ok(cipher && !cipher.includes('ya29'));
    assert.equal(decryptSecret(cipher), 'ya29.access-token-value');
  });

  it('returns null for empty values', () => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = 'test-google-token-key';
    assert.equal(encryptSecret(null), null);
    assert.equal(decryptSecret(''), null);
  });

  it('fails closed in production without dedicated encryption key', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'jwt-only';
    assert.throws(() => encryptSecret('secret'), /GOOGLE_TOKEN_ENCRYPTION_KEY is required/);
  });
});
