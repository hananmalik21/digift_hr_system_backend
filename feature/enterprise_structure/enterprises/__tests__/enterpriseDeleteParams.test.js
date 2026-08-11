import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEnterpriseDeletePayload,
  HARD_DELETE_CONFLICT_MESSAGE,
  isFkDeleteConflict,
  parseAutoFallbackQuery,
  parseBooleanQuery,
  parseEnterpriseIdParam,
  parseHardDeleteQuery,
  resolveEnterpriseActor,
  shapeEnterpriseDeleteResult
} from '../utils/enterpriseDeleteParams.js';
import { ConflictError, ValidationError } from '../../../../utils/errors/index.js';
import { sendErrorResponse } from '../../../../utils/errors/errorHandler.js';

test('parseBooleanQuery / hard / auto_fallback treat omitted/empty/false as false', () => {
  for (const value of [undefined, null, '', 'false', 'FALSE', '0', 'no']) {
    assert.equal(parseBooleanQuery(value), false);
    assert.equal(parseHardDeleteQuery(value), false);
    assert.equal(parseAutoFallbackQuery(value), false);
  }
});

test('parseBooleanQuery accepts true/TRUE/True/1', () => {
  for (const value of ['true', 'TRUE', 'True', '1']) {
    assert.equal(parseBooleanQuery(value), true);
    assert.equal(parseHardDeleteQuery(value), true);
  }
});

test('Boolean(req.query.hard) footgun is avoided for hard=false', () => {
  assert.equal(Boolean('false'), true);
  assert.equal(parseHardDeleteQuery('false'), false);
});

test('parseEnterpriseIdParam accepts positive integers only', () => {
  assert.equal(parseEnterpriseIdParam('23'), 23);
  assert.equal(parseEnterpriseIdParam(7), 7);
  assert.throws(() => parseEnterpriseIdParam('abc'), (err) => err instanceof ValidationError);
  assert.throws(() => parseEnterpriseIdParam('0'), (err) => err instanceof ValidationError);
  assert.throws(() => parseEnterpriseIdParam('-1'), (err) => err instanceof ValidationError);
  assert.throws(() => parseEnterpriseIdParam(''), (err) => err instanceof ValidationError);
  assert.throws(() => parseEnterpriseIdParam(undefined), (err) => err instanceof ValidationError);
});

test('buildEnterpriseDeletePayload uses numeric id and hard flag 0/1', () => {
  assert.deepEqual(
    buildEnterpriseDeletePayload({ enterpriseId: 23, hardDelete: true, actor: 'ADMIN' }),
    { enterprise_id: 23, hard: 1, actor: 'ADMIN' }
  );
  assert.deepEqual(
    buildEnterpriseDeletePayload({ enterpriseId: 23, hardDelete: false, actor: 'SYSTEM' }),
    { enterprise_id: 23, hard: 0, actor: 'SYSTEM' }
  );
});

test('resolveEnterpriseActor prefers header, then username, then id, then SYSTEM', () => {
  assert.equal(resolveEnterpriseActor({ headers: { 'x-user-id': 'hdr' }, user: { username: 'admin_user', id: 96 } }), 'hdr');
  assert.equal(resolveEnterpriseActor({ headers: {}, user: { username: 'admin_user', id: 96 } }), 'admin_user');
  assert.equal(resolveEnterpriseActor({ headers: {}, user: { id: 96 } }), '96');
  assert.equal(resolveEnterpriseActor({ headers: {}, user: {} }), 'SYSTEM');
});

test('isFkDeleteConflict detects package and annotated errors', () => {
  assert.equal(isFkDeleteConflict({ errorNum: 2292 }), true);
  assert.equal(isFkDeleteConflict({ code: 'FOREIGN_KEY_CONSTRAINT' }), true);
  assert.equal(
    isFkDeleteConflict({ message: 'Enterprise cannot be permanently deleted because related records exist. Use soft delete instead.' }),
    true
  );
  assert.equal(isFkDeleteConflict({ message: 'something else' }), false);
});

test('shapeEnterpriseDeleteResult normalizes soft and hard package payloads', () => {
  assert.deepEqual(
    shapeEnterpriseDeleteResult(23, false, { enterprise_id: 23, delete_type: 'SOFT', deleted: 'N', is_active: 'N', message: 'ok' }),
    {
      enterprise_id: 23,
      delete_type: 'SOFT',
      deleted: false,
      is_active: 'N',
      message: 'ok'
    }
  );
  assert.deepEqual(
    shapeEnterpriseDeleteResult(23, true, { enterprise_id: 23, delete_type: 'HARD', deleted: 'Y', message: 'gone' }),
    {
      enterprise_id: 23,
      delete_type: 'HARD',
      deleted: true,
      message: 'gone'
    }
  );
});

test('hard-delete conflict response includes structured details', () => {
  const fakeRes = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };

  sendErrorResponse(
    new ConflictError(
      HARD_DELETE_CONFLICT_MESSAGE,
      'FNDSEC.FNDSEC_USERS_FK1',
      null,
      'ORA-02292: integrity constraint (FNDSEC.FNDSEC_USERS_FK1) violated - child record found',
      { enterprise_id: 23, delete_type: 'HARD' }
    ),
    {},
    fakeRes
  );

  assert.equal(fakeRes.statusCode, 409);
  assert.equal(fakeRes.body.status, false);
  assert.equal(fakeRes.body.message, HARD_DELETE_CONFLICT_MESSAGE);
  assert.equal(fakeRes.body.error.code, 'CONFLICT');
  assert.deepEqual(fakeRes.body.error.details, {
    enterprise_id: 23,
    delete_type: 'HARD'
  });
});
