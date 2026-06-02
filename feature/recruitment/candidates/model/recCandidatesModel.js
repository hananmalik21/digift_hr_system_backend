import oracledb from 'oracledb';
import {
  guidInBind,
  jsonArrayToClobString,
  numOrNull,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull,
  withConnection
} from '../../shared/oraclePackageUtils.js';

export { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.CANDIDATE_PKG';
const CREATE_PROC = `${PKG}.CREATE_CANDIDATE`;
const UPDATE_PROC = `${PKG}.UPDATE_CANDIDATE`;
const DELETE_PROC = `${PKG}.DELETE_CANDIDATE`;

const GENERIC_ERROR_MESSAGE = 'Unable to process candidate. Please try again.';

function parseFileContent(body) {
  const raw = body.file_content ?? body.fileContent ?? body.file;
  if (raw == null || raw === '') return null;
  if (Buffer.isBuffer(raw)) return raw;
  let s = String(raw).trim();
  if (!s) return null;
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(s);
  if (dataUrlMatch) s = dataUrlMatch[1];
  try {
    return Buffer.from(s, 'base64');
  } catch (_) {
    return null;
  }
}

function buildSharedInBinds(b) {
  const fileBuf = parseFileContent(b);
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_first_name: { val: strOrNull(b.first_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_middle_name: { val: strOrNull(b.middle_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_last_name: { val: strOrNull(b.last_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_email: { val: strOrNull(b.email), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 },
    p_phone: { val: strOrNull(b.phone), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_current_title: {
      val: strOrNull(b.current_title),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_current_employer: {
      val: strOrNull(b.current_employer),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_years_experience: { val: numOrNull(b.years_experience), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_current_location: {
      val: strOrNull(b.current_location),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_source: { val: strOrNull(b.source), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_expected_salary: { val: numOrNull(b.expected_salary), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_salary_currency: {
      val: strOrNull(b.salary_currency),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 10
    },
    p_notice_period: { val: numOrNull(b.notice_period), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_linkedin_profile: {
      val: strOrNull(b.linkedin_profile),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1000
    },
    p_education_json: {
      val: jsonArrayToClobString(b.education_json),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_experience_json: {
      val: jsonArrayToClobString(b.experience_json),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_file_name: { val: strOrNull(b.file_name), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_file_type: { val: strOrNull(b.file_type), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_file_size: { val: numOrNull(b.file_size), dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  if (fileBuf != null) {
    binds.p_file_content = { val: fileBuf, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  } else {
    binds.p_file_content = { val: null, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  }

  return binds;
}

function parseCandidateCreateOut(outBinds) {
  return parseCreateOut(outBinds, {
    idKey: 'p_candidate_id',
    guidKey: 'p_candidate_guid',
    idField: 'candidate_id',
    guidField: 'candidate_guid'
  });
}

function packageErrorResult(message = GENERIC_ERROR_MESSAGE, extra = {}) {
  return {
    candidate_id: null,
    candidate_guid: null,
    status: 'ERROR',
    message,
    ...extra
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id      => :p_enterprise_id,
    p_first_name         => :p_first_name,
    p_middle_name        => :p_middle_name,
    p_last_name          => :p_last_name,
    p_email              => :p_email,
    p_phone              => :p_phone,
    p_current_title      => :p_current_title,
    p_current_employer   => :p_current_employer,
    p_years_experience   => :p_years_experience,
    p_current_location   => :p_current_location,
    p_source             => :p_source,
    p_expected_salary    => :p_expected_salary,
    p_salary_currency    => :p_salary_currency,
    p_notice_period      => :p_notice_period,
    p_linkedin_profile   => :p_linkedin_profile,
    p_education_json     => :p_education_json,
    p_experience_json    => :p_experience_json,
    p_file_name          => :p_file_name,
    p_file_type          => :p_file_type,
    p_file_size          => :p_file_size,
    p_file_content       => :p_file_content,
    p_created_by         => :p_created_by,
    p_candidate_id       => :p_candidate_id,
    p_candidate_guid     => :p_candidate_guid,
    p_status             => :p_status,
    p_message            => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_enterprise_id      => :p_enterprise_id,
    p_candidate_guid     => :p_candidate_guid,
    p_first_name         => :p_first_name,
    p_middle_name        => :p_middle_name,
    p_last_name          => :p_last_name,
    p_email              => :p_email,
    p_phone              => :p_phone,
    p_current_title      => :p_current_title,
    p_current_employer   => :p_current_employer,
    p_years_experience   => :p_years_experience,
    p_current_location   => :p_current_location,
    p_source             => :p_source,
    p_expected_salary    => :p_expected_salary,
    p_salary_currency    => :p_salary_currency,
    p_notice_period      => :p_notice_period,
    p_linkedin_profile   => :p_linkedin_profile,
    p_status_code        => :p_status_code,
    p_education_json     => :p_education_json,
    p_experience_json    => :p_experience_json,
    p_file_name          => :p_file_name,
    p_file_type          => :p_file_type,
    p_file_size          => :p_file_size,
    p_file_content       => :p_file_content,
    p_updated_by         => :p_updated_by,
    p_status             => :p_status,
    p_message            => :p_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_enterprise_id  => :p_enterprise_id,
    p_candidate_guid => :p_candidate_guid,
    p_deleted_by     => :p_deleted_by,
    p_status         => :p_status,
    p_message        => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ candidate_id: number|null, candidate_guid: string|null, status: string, message: string }>}
 */
export async function createCandidateViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    ...buildSharedInBinds(b),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_candidate_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_candidate_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCandidateCreateOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidatesModel] CREATE_CANDIDATE failed:', err?.errorNum ?? '', '[redacted]');
    return packageErrorResult();
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function updateCandidateViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_candidate_guid: guidInBind(b.candidate_guid),
    p_status_code: { val: strOrNull(b.status_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...buildSharedInBinds(b),
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidatesModel] UPDATE_CANDIDATE failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function deleteCandidateViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: guidInBind(b.candidate_guid),
    p_deleted_by: { val: strOrNull(b.deleted_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidatesModel] DELETE_CANDIDATE failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}
