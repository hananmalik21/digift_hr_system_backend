import test from 'node:test';
import assert from 'node:assert/strict';
import { healthHandler } from '../../routes/health.routes.js';

test('healthHandler returns status OK without sensitive fields', () => {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  healthHandler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, true);
  assert.equal(res.body.data.status, 'OK');
  assert.ok(res.body.data.timestamp);
  assert.equal(res.body.data.wallet, undefined);
  assert.equal(res.body.data.env, undefined);
});
