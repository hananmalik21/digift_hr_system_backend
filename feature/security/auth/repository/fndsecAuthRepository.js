import oracledb from 'oracledb';
import db from '../../../../config/db.js';

const AUTH_PKG = 'FNDSEC.FNDSEC_AUTH_PKG';

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

/**
 * Fetch stored password hash for tenant-scoped login (Argon2/bcrypt verification in Node).
 * Uses direct SQL so login works when the DB package has not been redeployed yet.
 *
 * @param {number} enterpriseId
 * @param {string} loginIdLower
 * @returns {Promise<string|null>}
 */
export async function fetchPasswordHashForLogin(enterpriseId, loginIdLower) {
  const sql = `
SELECT PASSWORD_HASH
  FROM FNDSEC.FNDSEC_USERS
 WHERE ENTERPRISE_ID = :enterprise_id
   AND (
         LOWER(USERNAME) = :login_id
      OR LOWER(PRIMARY_EMAIL) = :login_id
       )
   AND ROWNUM = 1`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        login_id: { val: String(loginIdLower ?? ''), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const raw = result?.rows?.[0]?.PASSWORD_HASH ?? result?.rows?.[0]?.password_hash ?? null;
    if (raw == null) return null;
    return readClobOut(raw);
  });
}

/**
 * @param {{ login_id: string, enterprise_id: number, password_valid: 'Y'|'N' }} input
 * @returns {Promise<{ success: boolean, message: string, user: object|null }>}
 */
export async function loginUserViaPackage(input) {
  const json = JSON.stringify(input);
  const plsql = `
BEGIN
  ${AUTH_PKG}.LOGIN_USER(
    P_INPUT_JSON => :p_input_json,
    P_SUCCESS    => :p_success,
    P_MESSAGE    => :p_message,
    P_USER_JSON  => :p_user_json
  );
END;`;

  return withConnection(async (connection) => {
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
    const successFlag = (normalizeOutString(ob.p_success) ?? 'N').toUpperCase().slice(0, 1);
    const message = normalizeOutString(ob.p_message) ?? '';
    const userJsonStr = await readClobOut(ob.p_user_json);

    let user = null;
    if (userJsonStr) {
      try {
        user = JSON.parse(userJsonStr);
      } catch {
        user = null;
      }
    }

    return {
      success: successFlag === 'Y',
      message,
      user
    };
  });
}
