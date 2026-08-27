import oracledb from 'oracledb';
import {
  guidInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  passwordHashInBind,
  strOrNull,
  withConnection
} from '../../../../utils/oraclePackageUtils.js';

const PKG = 'FNDSEC.RESET_USER_PASSWORD_PKG';

/** Lookup is against FNDSEC.FNDSEC_USERS only (no EMPL.EMPLOYEES). */
const GET_RESET_ACCOUNT_PLSQL = `
BEGIN
  ${PKG}.GET_RESET_ACCOUNT(
    p_enterprise_id  => :p_enterprise_id,
    p_email          => :p_email,
    p_user_id        => :p_user_id,
    p_user_guid      => :p_user_guid,
    p_username       => :p_username,
    p_primary_email  => :p_primary_email,
    p_account_status => :p_account_status,
    p_locked_flag    => :p_locked_flag,
    p_active_flag    => :p_active_flag,
    p_result_code    => :p_result_code,
    p_result_message => :p_result_message
  );
END;`;

const RESET_PASSWORD_PLSQL = `
BEGIN
  ${PKG}.RESET_PASSWORD(
    p_enterprise_id  => :p_enterprise_id,
    p_user_guid      => :p_user_guid,
    p_password_hash  => :p_password_hash,
    p_updated_by     => :p_updated_by,
    p_result_code    => :p_result_code,
    p_result_message => :p_result_message
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
    user_id: normalizeOutNumber(ob.p_user_id),
    user_guid: normalizeOutGuidHex(ob.p_user_guid),
    username: normalizeOutString(ob.p_username),
    primary_email: normalizeOutString(ob.p_primary_email),
    account_status: normalizeOutString(ob.p_account_status),
    locked_flag: normalizeOutString(ob.p_locked_flag),
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
export async function getFndsecResetAccountViaPackage(enterpriseId, emailLower) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_email: {
      val: strOrNull(emailLower),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 320
    },
    p_user_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_user_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_username: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 150 },
    p_primary_email: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 320 },
    p_account_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    p_locked_flag: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 1 },
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
 * @param {string} userGuidHex
 * @param {string} passwordHash
 * @param {string} updatedBy
 */
export async function resetFndsecUserPasswordViaPackage(
  enterpriseId,
  userGuidHex,
  passwordHash,
  updatedBy
) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_user_guid: guidInBind(userGuidHex),
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
