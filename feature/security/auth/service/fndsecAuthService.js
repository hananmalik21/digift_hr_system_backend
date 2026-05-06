import oracledb from 'oracledb';
import argon2 from 'argon2';
import bcrypt from 'bcrypt';
import db from '../../../../config/db.js';
import { ValidationError } from '../../../../utils/errors/index.js';
import { authDebugEnabled } from '../utils/authDebug.js';

const AUTH_PKG = 'FNDSEC.FNDSEC_AUTH_PKG.LOGIN_USER';
const INVALID_CREDS_MSG = 'Invalid username or password.';
const HASH_PREFIX_ARGON2 = '$argon2';
const HASH_PREFIX_BCRYPT = '$2';

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

async function verifyUserPassword(plainPassword, passwordHash) {
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

export function validateLoginBody(body) {
  const b = asPlainObject(body);
  const errors = [];
  const username = isBlank(b.username) ? '' : String(b.username).trim();
  const password = isBlank(b.password) ? '' : String(b.password);

  if (isBlank(b.enterprise_id)) errors.push('enterprise_id is required');
  if (!username) errors.push('username is required');
  if (!password) errors.push('password is required');
  if (!isBlank(b.enterprise_id) && !toPositiveNumberOrNull(b.enterprise_id)) {
    errors.push('enterprise_id must be a positive number');
  }
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

export async function loginUserService(body) {
  const input = asPlainObject(body);
  const enterprise_id = input.enterprise_id;
  const usernameRaw = input.username;
  const passwordRaw = input.password;
  const username = String(usernameRaw ?? '').trim();
  const usernameLower = username.toLowerCase();
  const password = String(passwordRaw ?? '');

  return await withConnection(async (connection) => {
    const ent = toPositiveNumberOrNull(enterprise_id);
    if (!ent) {
      // Should already be caught by validateLoginBody, but keep it defensive.
      throw new ValidationError('Validation failed', ['enterprise_id must be a positive number']);
    }

    const row = await fetchUserForLogin(connection, ent, usernameLower);
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
        '[auth/login] enterprise_id=%s username=%s user_found=%s hash_type=%s hash_len=%s password_valid=%s',
        ent,
        usernameLower,
        !!row,
        hashType,
        password_hash ? String(password_hash.length) : '0',
        password_valid
      );
    }

    // Call package for both valid and invalid passwords (it handles attempts/locks/audit).
    const { p_success, p_message, userJsonStr } = await callLoginPkg(connection, {
      enterprise_id: ent,
      // Package does: lower(trim(json_value(...))) so send the normalized value to match.
      username: usernameLower,
      password_valid
    });

    if (p_success !== 'Y') {
      if (authDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log('[auth/login] pkg_success=N msg=%s', String(p_message ?? '').slice(0, 200));
      }
      return {
        httpStatus: 401,
        payload: { success: false, message: p_message || INVALID_CREDS_MSG, data: null }
      };
    }

    const userObj = parseUserJsonOrEmpty(userJsonStr);
    const data = userObj && Object.keys(userObj).length ? userObj : null;

    return {
      httpStatus: 200,
      payload: {
        success: true,
        message: p_message || 'Login successful.',
        data
      }
    };
  });
}

