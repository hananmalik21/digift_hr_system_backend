import oracledb from 'oracledb';
import argon2 from 'argon2';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';

const PKG = 'FNDSEC.FNDSEC_USERS_PKG';

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Package success: P_MESSAGE must contain "successfully" (case-insensitive). */
export function packageMessageIndicatesSuccess(message) {
  return /successfully/i.test(String(message ?? ''));
}

export async function hashPasswordArgon2id(plain) {
  return argon2.hash(String(plain), { type: argon2.argon2id });
}

export function validateCreateUserBody(body) {
  const errors = [];
  const b = asPlainObject(body);
  const fields = [
    'enterprise_id',
    'user_code',
    'username',
    'first_name',
    'last_name',
    'primary_email',
    'password'
  ];
  for (const f of fields) {
    if (isBlank(b[f])) errors.push(`${f} is required`);
  }
  if (errors.length) {
    throw new ValidationError('Validation failed', errors);
  }
}

export function validateUpdateUserBody(body) {
  const b = asPlainObject(body);
  if (isBlank(b.user_guid)) {
    throw new ValidationError('Validation failed', ['user_guid is required']);
  }
}

export function validateDeleteUserParams(userGuid) {
  if (isBlank(userGuid)) {
    throw new ValidationError('Validation failed', ['user_guid is required']);
  }
}

export async function buildCreatePayloadWithPasswordHash(body) {
  const payload = { ...asPlainObject(body) };
  delete payload.password_hash;
  if (!Object.prototype.hasOwnProperty.call(payload, 'password')) {
    throw new ValidationError('Validation failed', ['password is required']);
  }
  const plain = payload.password;
  if (isBlank(plain)) {
    throw new ValidationError('Validation failed', ['password is required']);
  }
  payload.password_hash = await hashPasswordArgon2id(plain);
  delete payload.password;
  return payload;
}

export async function buildUpdatePayloadWithOptionalPasswordHash(body) {
  const payload = { ...asPlainObject(body) };
  delete payload.password_hash;
  if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
    const plain = payload.password;
    delete payload.password;
    if (!isBlank(plain)) {
      payload.password_hash = await hashPasswordArgon2id(plain);
    }
  }
  return payload;
}

/**
 * @returns {Promise<{ success: boolean, message: string, user_id: number|null, user_guid: string|null }>}
 */
export async function createUserViaPackage(payloadObject) {
  const json = JSON.stringify(asPlainObject(payloadObject));
  const plsql = `
BEGIN
  ${PKG}.CREATE_USER(
    P_INPUT_JSON => :p_input_json,
    P_MESSAGE    => :p_message,
    P_USER_ID    => :p_user_id,
    P_USER_GUID  => :p_user_guid
  );
END;`;

  const result = await withConnection((connection) =>
    connection.execute(
      plsql,
      {
        p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
        p_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
        p_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 128 }
      },
      { autoCommit: true }
    )
  );

  const ob = result?.outBinds || {};
  const message = (normalizeOutString(ob.p_message) ?? '').trim();
  const user_id = normalizeOutNumber(ob.p_user_id);
  const user_guid = normalizeOutString(ob.p_user_guid);
  const success = packageMessageIndicatesSuccess(message);
  return { success, message, user_id, user_guid };
}

/**
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function updateUserViaPackage(payloadObject) {
  const json = JSON.stringify(asPlainObject(payloadObject));
  const plsql = `
BEGIN
  ${PKG}.UPDATE_USER(
    P_INPUT_JSON => :p_input_json,
    P_MESSAGE    => :p_message
  );
END;`;

  const result = await withConnection((connection) =>
    connection.execute(
      plsql,
      {
        p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
      },
      { autoCommit: true }
    )
  );

  const ob = result?.outBinds || {};
  const message = (normalizeOutString(ob.p_message) ?? '').trim();
  const success = packageMessageIndicatesSuccess(message);
  return { success, message };
}

/**
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function deleteUserViaPackage(userGuid, deletedBy) {
  const plsql = `
BEGIN
  ${PKG}.DELETE_USER(
    P_USER_GUID  => :p_user_guid,
    P_DELETED_BY => :p_deleted_by,
    P_MESSAGE    => :p_message
  );
END;`;

  const guid = String(userGuid ?? '').trim();
  const actor = String(deletedBy ?? '').trim();

  const result = await withConnection((connection) =>
    connection.execute(
      plsql,
      {
        p_user_guid: { val: guid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 128 },
        p_deleted_by: { val: actor, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 400 },
        p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
      },
      { autoCommit: true }
    )
  );

  const ob = result?.outBinds || {};
  const message = (normalizeOutString(ob.p_message) ?? '').trim();
  const success = packageMessageIndicatesSuccess(message);
  return { success, message };
}
