import oracledb from 'oracledb';
import {
  guidInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  passwordHashInBind,
  strOrNull,
  withConnection
} from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.RESET_CANDIDATE_PASSWORD_PKG';

const GET_RESET_ACCOUNT_PLSQL = `
BEGIN
  ${PKG}.GET_RESET_ACCOUNT(
    p_enterprise_id       => :p_enterprise_id,
    p_email               => :p_email,
    p_candidate_id        => :p_candidate_id,
    p_candidate_guid      => :p_candidate_guid,
    p_candidate_user_id   => :p_candidate_user_id,
    p_candidate_user_guid => :p_candidate_user_guid,
    p_email_out           => :p_email_out,
    p_user_status         => :p_user_status,
    p_email_verified_flag => :p_email_verified_flag,
    p_active_flag         => :p_active_flag,
    p_result_code         => :p_result_code,
    p_result_message      => :p_result_message
  );
END;`;

const RESET_PASSWORD_PLSQL = `
BEGIN
  ${PKG}.RESET_PASSWORD(
    p_enterprise_id       => :p_enterprise_id,
    p_candidate_user_guid => :p_candidate_user_guid,
    p_password_hash       => :p_password_hash,
    p_updated_by          => :p_updated_by,
    p_result_code         => :p_result_code,
    p_result_message      => :p_result_message
  );
END;`;

function resultOutBinds() {
  return {
    p_result_code: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    p_result_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
export function parseGetResetAccountOut(outBinds) {
  const ob = outBinds || {};
  return {
    candidate_id: normalizeOutNumber(ob.p_candidate_id),
    candidate_guid: normalizeOutGuidHex(ob.p_candidate_guid),
    candidate_user_id: normalizeOutNumber(ob.p_candidate_user_id),
    candidate_user_guid: normalizeOutGuidHex(ob.p_candidate_user_guid),
    email: normalizeOutString(ob.p_email_out),
    user_status: normalizeOutString(ob.p_user_status),
    email_verified_flag: normalizeOutString(ob.p_email_verified_flag),
    active_flag: normalizeOutString(ob.p_active_flag),
    result_code: normalizeOutString(ob.p_result_code),
    result_message: normalizeOutString(ob.p_result_message) ?? ''
  };
}

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
export function parseResetPasswordOut(outBinds) {
  const ob = outBinds || {};
  return {
    result_code: normalizeOutString(ob.p_result_code),
    result_message: normalizeOutString(ob.p_result_message) ?? ''
  };
}

/**
 * @param {number} enterpriseId
 * @param {string} emailLower
 */
export async function getResetAccountViaPackage(enterpriseId, emailLower) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_email: { val: strOrNull(emailLower), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 },
    p_candidate_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_candidate_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_email_out: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 320 },
    p_user_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    p_email_verified_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
    p_active_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
    ...resultOutBinds()
  };

  const result = await withConnection((connection) =>
    connection.execute(GET_RESET_ACCOUNT_PLSQL, binds, { autoCommit: true })
  );
  return parseGetResetAccountOut(result?.outBinds);
}

/**
 * @param {number} enterpriseId
 * @param {string} candidateUserGuidHex
 * @param {string} passwordHash
 * @param {string} updatedBy
 */
export async function resetCandidatePasswordViaPackage(
  enterpriseId,
  candidateUserGuidHex,
  passwordHash,
  updatedBy
) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_user_guid: guidInBind(candidateUserGuidHex),
    p_password_hash: passwordHashInBind(passwordHash),
    p_updated_by: {
      val: strOrNull(updatedBy),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 100
    },
    ...resultOutBinds()
  };

  const result = await withConnection((connection) =>
    connection.execute(RESET_PASSWORD_PLSQL, binds, { autoCommit: true })
  );
  return parseResetPasswordOut(result?.outBinds);
}
