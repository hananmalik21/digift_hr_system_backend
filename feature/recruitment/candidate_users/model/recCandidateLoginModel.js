import oracledb from 'oracledb';
import {
  parseCandidateLoginOut,
  passwordHashInBind,
  readDbPasswordHashValue,
  statusOutBinds,
  strOrNull,
  withConnection
} from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.CANDIDATE_LOGIN_PKG';
const LOGIN_PROC = `${PKG}.LOGIN_CANDIDATE`;

const LOGIN_PLSQL = `
BEGIN
  ${LOGIN_PROC}(
    p_enterprise_id       => :p_enterprise_id,
    p_email               => :p_email,
    p_password_hash       => :p_password_hash,
    p_candidate_user_id   => :p_candidate_user_id,
    p_candidate_user_guid => :p_candidate_user_guid,
    p_candidate_id        => :p_candidate_id,
    p_candidate_guid      => :p_candidate_guid,
    p_full_name           => :p_full_name,
    p_email_out           => :p_email_out,
    p_user_status         => :p_user_status,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 * @returns {Promise<string|null>}
 */
export async function fetchCandidatePasswordHash(enterpriseId, emailLower) {
  const sql = `
SELECT PASSWORD_HASH
FROM REC.CANDIDATE_USERS
WHERE ENTERPRISE_ID = :p_enterprise_id
  AND LOWER(EMAIL) = :p_email
FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const r = await connection.execute(
      sql,
      {
        p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_email: { val: emailLower, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 }
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const row = r.rows?.[0];
    if (!row) return null;
    return readDbPasswordHashValue(row.PASSWORD_HASH ?? row.password_hash);
  });
}

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 * @param {string} passwordHash Stored hash — must match REC.CANDIDATE_USERS.PASSWORD_HASH
 */
export async function loginCandidateViaPackage(enterpriseId, emailLower, passwordHash) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_email: { val: strOrNull(emailLower), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 },
    p_password_hash: passwordHashInBind(passwordHash),
    p_candidate_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_candidate_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_full_name: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 500 },
    p_email_out: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 320 },
    p_user_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    ...statusOutBinds()
  };

  const result = await withConnection((connection) =>
    connection.execute(LOGIN_PLSQL, binds, { autoCommit: true })
  );
  return parseCandidateLoginOut(result?.outBinds);
}
