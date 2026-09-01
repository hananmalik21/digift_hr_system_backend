import test from 'node:test';
import assert from 'node:assert/strict';
import { logger } from '../logger.js';

function captureConsole(fn) {
  const lines = [];
  const original = console.log;
  console.log = (msg) => {
    lines.push(String(msg));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

test('logger redacts password and token fields', () => {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = 'info';
  try {
    const lines = captureConsole(() => {
      logger.info('login attempt', { username: 'admin', password: 'secret', token: 'abc' });
    });
    assert.equal(lines.length, 1);
    const payload = JSON.parse(lines[0]);
    assert.equal(payload.msg, 'login attempt');
    assert.equal(payload.username, 'admin');
    assert.equal(payload.password, '[REDACTED]');
    assert.equal(payload.token, '[REDACTED]');
  } finally {
    if (previous === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = previous;
  }
});
