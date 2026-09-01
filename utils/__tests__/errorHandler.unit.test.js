import test from 'node:test';
import assert from 'node:assert/strict';
import { sendErrorResponse } from '../errors/errorHandler.js';
import { DatabaseError } from '../errors/DatabaseError.js';
import { ValidationError } from '@digifyhr/common';

function mockRes() {
  return {
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
}

test('validation errors return 400 without stack outside development', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const res = mockRes();
    sendErrorResponse(new ValidationError('email is required', ['email is required']), {}, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.status, false);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.equal(res.body.error.stack, undefined);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('database original_error is omitted when NODE_ENV is not development', () => {
  const previous = process.env.NODE_ENV;
  delete process.env.NODE_ENV;
  try {
    const res = mockRes();
    const dbErr = new DatabaseError('failed', {
      message: 'ORA-00942: table or view does not exist SELECT * FROM SECRET',
      errorNum: 942
    });
    sendErrorResponse(dbErr, {}, res);
    assert.equal(res.body.error.details?.original_error, undefined);
    assert.equal(res.body.error.stack, undefined);
    assert.ok(res.body.error.details?.oracle_code || res.body.error.details?.error_num === 942);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('development mode may include original_error for DatabaseError', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  try {
    const res = mockRes();
    const dbErr = new DatabaseError('failed', {
      message: 'ORA-00942: table or view does not exist',
      errorNum: 942
    });
    sendErrorResponse(dbErr, {}, res);
    assert.equal(res.body.error.details?.original_error?.errorNum, 942);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
