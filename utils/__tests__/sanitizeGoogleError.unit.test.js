/**
 * Unit tests for Google error sanitization helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractGoogleApiError,
  sanitizeGoogleError
} from '../sanitizeGoogleError.js';

describe('sanitizeGoogleError', () => {
  it('redacts bearer and Google access tokens', () => {
    const message = sanitizeGoogleError(
      new Error('Authorization: Bearer abc.def.ghi failed for ya29.A0A1token')
    );
    assert.match(message, /Bearer \[REDACTED\]/);
    assert.match(message, /\[REDACTED_ACCESS_TOKEN\]/);
    assert.doesNotMatch(message, /ya29/);
  });

  it('extracts Google API error payloads', () => {
    const detail = extractGoogleApiError({
      response: {
        data: {
          error: 'invalid_grant',
          error_description: 'Bad Request'
        }
      }
    });
    assert.equal(detail, 'invalid_grant: Bad Request');
  });
});
