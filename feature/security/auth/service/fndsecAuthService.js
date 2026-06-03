import oracledb from 'oracledb';
import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { authDebugEnabled } from '../utils/authDebug.js';

const AUTH_PKG = 'FNDSEC.FNDSEC_AUTH_PKG.LOGIN_USER';
const INVALID_CREDS_MSG = 'Invalid username or password.';
const HASH_PREFIX_ARGON2 = '$argon2';
const HASH_PREFIX_BCRYPT = '$2';
const LOGIN_ID_REQUIRED_MSG = 'Username or email is required.';
const LOCKED_ACCOUNT_MSG = 'Your account is locked.';

function normalizeLoginId(raw) {
  return String(raw ?? '').trim().toLowerCase();
}

function sanitizePkgMessage(message) {
  const msg = String(message ?? '').trim();
  if (!msg) return '';
  // Never leak Oracle details.
  if (/ORA-\d+/i.test(msg)) return '';
  return msg;
}

function resolveAuthFailureMessage(pkgMessage) {
  const msg = sanitizePkgMessage(pkgMessage);
  if (!msg) return INVALID_CREDS_MSG;
  if (/locked/i.test(msg)) return LOCKED_ACCOUNT_MSG;
  // Keep other business-safe messages from the package (status/expiry/password-expired).
  if (/invalid username or password/i.test(msg)) return INVALID_CREDS_MSG;
  return msg;
}

function toHashStringMaybe(val) {
  if (val == null) return '';
  if (Buffer.isBuffer(val)) return val.toString('utf8').trim();
  if (val instanceof Uint8Array) return Buffer.from(val).toString('utf8').trim();
  return String(val).trim();
}

async function readPasswordHashMaybeClob(val) {
  if (val == null) return '';
  // If Oracle returns CLOB as Lob, it has getData().
  if (typeof val?.getData === 'function') {
    const s = await readClobOut(val);
    return String(s ?? '').trim();
  }
  return toHashStringMaybe(val);
}

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

export async function verifyUserPassword(plainPassword, passwordHash) {
  if (!plainPassword || !passwordHash) return false;
  const hash = toHashStringMaybe(passwordHash);
  const plain = String(plainPassword);
  if (!hash) return false;

  // Security users are created with Argon2id in this codebase; keep bcrypt as a safe fallback.
  if (hash.startsWith(HASH_PREFIX_ARGON2) || hash.includes('argon2')) {
    return argon2.verify(hash, plain);
  }
  if (hash.startsWith(HASH_PREFIX_BCRYPT)) {
    return bcrypt.compare(plain, hash);
  }

  // Unknown format -> treat as mismatch (don't throw, don't leak details).
  return false;
}

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || String(secret).trim().length < 16) return null;
  return String(secret);
}

function jwtExpiresIn() {
  return process.env.JWT_EXPIRES_IN || '1d';
}

export function validateLoginBody(body) {
  const b = asPlainObject(body);
  const errors = [];
  const effectiveLoginId =
    (isBlank(b.login_id) ? '' : String(b.login_id)) ||
    // Backward compatible fallback: accept legacy username/email if login_id is absent.
    (isBlank(b.username) ? '' : String(b.username)) ||
    (isBlank(b.email) ? '' : String(b.email));

  const password = isBlank(b.password) ? '' : String(b.password);

  if (!String(effectiveLoginId ?? '').trim()) errors.push(LOGIN_ID_REQUIRED_MSG);
  if (!password) errors.push('password is required');
  if (errors.length) throw new ValidationError('Validation failed', errors);
}

async function fetchUserForLoginByUsername(connection, usernameLower) {
  const sql = `
SELECT USER_ID, USER_GUID, PASSWORD_HASH
FROM FNDSEC.FNDSEC_USERS
WHERE LOWER(USERNAME) = :username`;

  const result = await connection.execute(
    sql,
    {
      username: { val: String(usernameLower ?? ''), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 300 }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result?.rows?.[0] || null;
}

async function fetchUserForLoginByEmail(connection, emailLower) {
  const sql = `
SELECT USER_ID, USER_GUID, PASSWORD_HASH
FROM FNDSEC.FNDSEC_USERS
WHERE LOWER(PRIMARY_EMAIL) = :email`;

  const result = await connection.execute(
    sql,
    {
      email: { val: String(emailLower ?? ''), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 }
    },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result?.rows?.[0] || null;
}

async function fetchUserForLoginByLoginId(connection, loginIdLower) {
  if (!loginIdLower) return null;
  // Try username first (preferred), then email.
  const byUsername = await fetchUserForLoginByUsername(connection, loginIdLower);
  if (byUsername) return byUsername;
  return await fetchUserForLoginByEmail(connection, loginIdLower);
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

export async function loginUserService(body) {
  const input = asPlainObject(body);
  const loginIdRaw = input.login_id ?? input.username ?? input.email;
  const passwordRaw = input.password;
  const login_id_lower = normalizeLoginId(loginIdRaw);
  const password = String(passwordRaw ?? '');

  return await withConnection(async (connection) => {
    const row = await fetchUserForLoginByLoginId(connection, login_id_lower);
    const password_hash_raw = row?.PASSWORD_HASH ?? row?.password_hash ?? null;
    const password_hash = await readPasswordHashMaybeClob(password_hash_raw);

    let ok = false;
    try {
      if (password_hash) {
        ok = await verifyUserPassword(password, password_hash);
      }
    } catch (_) {
      ok = false;
    }

    const password_valid = ok ? 'Y' : 'N';

    if (authDebugEnabled()) {
      const hashType = password_hash.startsWith(HASH_PREFIX_ARGON2)
        ? 'argon2'
        : password_hash.startsWith(HASH_PREFIX_BCRYPT)
          ? 'bcrypt'
          : password_hash
              ? 'unknown'
              : 'missing';
      // eslint-disable-next-line no-console
      console.log(
        '[auth/login] login_id=%s user_found=%s hash_type=%s hash_len=%s password_valid=%s',
        login_id_lower,
        !!row,
        hashType,
        password_hash ? String(password_hash.length) : '0',
        password_valid
      );
    }

    // Call package for both valid and invalid passwords (it handles attempts/locks/audit).
    const { p_success, p_message, userJsonStr } = await callLoginPkg(connection, {
      login_id: login_id_lower,
      password_valid
    });

    if (p_success !== 'Y') {
      if (authDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log('[auth/login] pkg_success=N msg=%s', String(p_message ?? '').slice(0, 200));
      }

      return {
        httpStatus: 401,
        payload: { success: false, message: resolveAuthFailureMessage(p_message), data: null }
      };
    }

    const userObj = parseUserJsonOrEmpty(userJsonStr);
    const secret = resolveJwtSecret();
    if (!secret) {
      return { httpStatus: 500, payload: { success: false, message: 'Unexpected server error', data: null } };
    }

    const responseUserId = row?.USER_ID ?? row?.user_id ?? userObj.user_id ?? userObj.userId ?? null;
    const responseUserGuid = userObj.user_guid ?? userObj.userGuid ?? null;
    const responseEnterpriseId = userObj.enterprise_id ?? userObj.enterpriseId ?? null;
    const responseUsername = userObj.username ?? userObj.user_name ?? userObj.userName ?? null;

    const token = jwt.sign(
      {
        user_id: responseUserId,
        user_guid: responseUserGuid,
        enterprise_id: responseEnterpriseId,
        username: responseUsername != null ? String(responseUsername) : login_id_lower
      },
      secret,
      { expiresIn: jwtExpiresIn() }
    );

    return {
      httpStatus: 200,
      payload: {
        success: true,
        message: p_message || 'Login successful.',
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

