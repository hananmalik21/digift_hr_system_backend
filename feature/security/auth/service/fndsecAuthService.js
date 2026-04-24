import oracledb from 'oracledb';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import db from '../../../../config/db.js';
import { bufferToGuidHex } from '../../../../src/utils/oracleGuid.js';
import { ValidationError } from '../../../../utils/errors/index.js';

const AUTH_PKG = 'FNDSEC.FNDSEC_AUTH_PKG.LOGIN_USER';
const INVALID_CREDS_MSG = 'Invalid username or password.';

function asPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function isBlank(v) {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

function toPositiveNumberOrNull(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

async function readClobOut(val) {
  if (val == null) return null;
  if (typeof val === 'string') return val;
  if (typeof val.getData === 'function') {
    const p = val.getData();
    const data =
      typeof p?.then === 'function'
        ? await p
        : await new Promise((res, rej) => val.getData((err, d) => (err ? rej(err) : res(d))));
    return data != null ? String(data) : null;
  }
  return String(val);
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

export function validateLoginBody(body) {
  const b = asPlainObject(body);
  const errors = [];
  if (isBlank(b.enterprise_id)) errors.push('enterprise_id is required');
  if (isBlank(b.username)) errors.push('username is required');
  if (isBlank(b.password)) errors.push('password is required');
  if (errors.length) throw new ValidationError('Validation failed', errors);
}

async function fetchUserForLogin(connection, enterpriseId, username) {
  const ent = toPositiveNumberOrNull(enterpriseId);
  if (!ent) return null;
  const sql = `
SELECT USER_ID, USER_GUID, PASSWORD_HASH
FROM FNDSEC.FNDSEC_USERS
WHERE ENTERPRISE_ID = :enterprise_id
  AND LOWER(USERNAME) = LOWER(:username)`;

  const result = await connection.execute(
    sql,
    {
      enterprise_id: { val: ent, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      username: { val: String(username ?? ''), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 300 }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result?.rows?.[0] || null;
}

async function callLoginPkg(connection, inputObj) {
  const json = JSON.stringify(asPlainObject(inputObj));
  const plsql = `
BEGIN
  ${AUTH_PKG}(
    P_INPUT_JSON => :p_input_json,
    P_SUCCESS    => :p_success,
    P_MESSAGE    => :p_message,
    P_USER_JSON  => :p_user_json
  );
END;`;

  const result = await connection.execute(
    plsql,
    {
      p_input_json: { val: json, dir: oracledb.BIND_IN, type: oracledb.CLOB },
      p_success: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
      p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 },
      p_user_json: { dir: oracledb.BIND_OUT, type: oracledb.CLOB }
    },
    { autoCommit: true }
  );

  const ob = result?.outBinds || {};
  const p_success = (normalizeOutString(ob.p_success) ?? 'N').toUpperCase().slice(0, 1);
  const p_message = normalizeOutString(ob.p_message) ?? '';
  const userJsonStr = await readClobOut(ob.p_user_json);
  return { p_success, p_message, userJsonStr };
}

function parseUserJsonOrEmpty(userJsonStr) {
  const s = String(userJsonStr ?? '').trim();
  if (!s) return {};
  try {
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function resolveUserGuid(val) {
  if (val == null) return null;
  if (Buffer.isBuffer(val) || val instanceof Uint8Array) return bufferToGuidHex(val);
  const s = String(val).trim();
  return s.length ? s : null;
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim().length < 16) return null;
  return String(secret);
}

function jwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '1d';
}

export async function loginUserService(body) {
  const input = asPlainObject(body);
  const enterprise_id = input.enterprise_id;
  const username = input.username;
  const password = input.password;

  return await withConnection(async (connection) => {
    const row = await fetchUserForLogin(connection, enterprise_id, username);
    if (!row) {
      return { httpStatus: 400, payload: { success: false, message: INVALID_CREDS_MSG } };
    }

    const user_id = row.USER_ID ?? row.user_id ?? null;
    const user_guid = resolveUserGuid(row.USER_GUID ?? row.user_guid);
    const password_hash = row.PASSWORD_HASH ?? row.password_hash ?? null;

    let ok = false;
    try {
      if (password_hash && String(password_hash).trim()) {
        ok = await argon2.verify(String(password_hash), String(password));
      }
    } catch (_) {
      ok = false;
    }

    const password_valid = ok ? 'Y' : 'N';

    // Call package for both valid and invalid passwords (it handles attempts/locks/audit).
    const { p_success, p_message, userJsonStr } = await callLoginPkg(connection, {
      enterprise_id: toPositiveNumberOrNull(enterprise_id),
      username: String(username),
      password_valid
    });

    if (p_success !== 'Y') {
      return { httpStatus: 400, payload: { success: false, message: p_message || 'Login failed.' } };
    }

    const userObj = parseUserJsonOrEmpty(userJsonStr);

    const secret = resolveJwtSecret();
    if (!secret) {
      return { httpStatus: 500, payload: { success: false, message: 'Unexpected server error' } };
    }

    const responseUserId = user_id ?? userObj.user_id ?? userObj.userId ?? null;
    const responseUserGuid = user_guid ?? userObj.user_guid ?? userObj.userGuid ?? null;
    const responseEnterpriseId =
      userObj.enterprise_id ?? userObj.enterpriseId ?? toPositiveNumberOrNull(enterprise_id);
    const responseUsername = userObj.username ?? userObj.user_name ?? userObj.userName ?? username ?? null;

    const token = jwt.sign(
      {
        user_id: responseUserId,
        user_guid: responseUserGuid,
        enterprise_id: responseEnterpriseId,
        username: responseUsername != null ? String(responseUsername) : String(username)
      },
      secret,
      { expiresIn: jwtExpiresIn() }
    );

    return {
      httpStatus: 200,
      payload: {
        success: true,
        message: p_message,
        access_token: token,
        data: {
          user_id: responseUserId,
          user_guid: responseUserGuid,
          enterprise_id: responseEnterpriseId,
          user_code: userObj.user_code ?? userObj.userCode ?? null,
          username: responseUsername,
          first_name: userObj.first_name ?? userObj.firstName ?? null,
          last_name: userObj.last_name ?? userObj.lastName ?? null,
          primary_email:
            userObj.primary_email ?? userObj.primaryEmail ?? userObj.email ?? userObj.primaryEmailAddress ?? null,
          password_expired: userObj.password_expired ?? userObj.passwordExpired ?? null
        }
      }
    };
  });
}

