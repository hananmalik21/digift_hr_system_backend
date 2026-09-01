import db from '../config/db.js';
import {
  ROW_OPTS,
  numOrNull,
  strOrNull,
  strLinkInBind,
  ynInBind,
  varcharInBind,
  guidHexInBind,
  outNumberBind,
  outGuidHexBind,
  oraclePlsqlErrorMessage,
  wrapOracleDbError,
  emailInBind,
  dateOnlyInBind,
  clobInBind,
  guidInBind,
  numberInBind,
  enterpriseIdInBind,
  activeFlagInBind,
  passwordHashInBind,
  auditInBind,
  clobJsonInBind,
  jsonArrayToClobString,
  normalizeOutString,
  normalizeOutNumber,
  normalizeOutGuidHex,
  packageStatusIsSuccess,
  statusOutBinds,
  parseActionOut,
  parseCreateOut,
  readDbPasswordHashValue,
  codeInBind
} from '@digifyhr/common';

export {
  ROW_OPTS,
  numOrNull,
  strOrNull,
  strLinkInBind,
  ynInBind,
  varcharInBind,
  guidHexInBind,
  outNumberBind,
  outGuidHexBind,
  oraclePlsqlErrorMessage,
  wrapOracleDbError,
  emailInBind,
  dateOnlyInBind,
  clobInBind,
  guidInBind,
  numberInBind,
  enterpriseIdInBind,
  activeFlagInBind,
  passwordHashInBind,
  auditInBind,
  clobJsonInBind,
  jsonArrayToClobString,
  normalizeOutString,
  normalizeOutNumber,
  normalizeOutGuidHex,
  packageStatusIsSuccess,
  statusOutBinds,
  parseActionOut,
  parseCreateOut,
  readDbPasswordHashValue,
  codeInBind
};

export async function withConnection(fn) {
  const connection = await db.getConnection();
  try {
    return await fn(connection);
  } finally {
    try {
      await connection.close();
    } catch (_) {}
  }
}

export async function executePackagePlsql(plsql, binds, parseOut, logLabel, errorResult) {
  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return parseOut(result?.outBinds);
  } catch (err) {
    console.error(`[${logLabel}]`, err?.errorNum != null ? `ORA-${err.errorNum}` : '', '[redacted]');
    const fallback = errorResult?.message ?? 'A database error occurred. Please try again.';
    return {
      ...errorResult,
      message: oraclePlsqlErrorMessage(err, fallback)
    };
  }
}

export function parseCandidateLoginOut(outBinds) {
  const ob = outBinds || {};
  return {
    candidate_user_id: normalizeOutNumber(ob.p_candidate_user_id),
    candidate_user_guid: normalizeOutGuidHex(ob.p_candidate_user_guid),
    candidate_id: normalizeOutNumber(ob.p_candidate_id),
    candidate_guid: normalizeOutGuidHex(ob.p_candidate_guid),
    full_name: normalizeOutString(ob.p_full_name),
    email: normalizeOutString(ob.p_email_out),
    user_status: normalizeOutString(ob.p_user_status),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

export function parseCandidateRegistrationOut(outBinds) {
  const ob = outBinds || {};
  return {
    candidate_id: normalizeOutNumber(ob.p_candidate_id),
    candidate_guid: normalizeOutGuidHex(ob.p_candidate_guid),
    candidate_user_id: normalizeOutNumber(ob.p_candidate_user_id),
    candidate_user_guid: normalizeOutGuidHex(ob.p_candidate_user_guid),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}
