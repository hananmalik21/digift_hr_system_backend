import oracledb from 'oracledb';
import { buildContentFieldBinds } from '../utils/recJobPostingContentUtils.js';
import {
  guidInBind,
  numOrNull,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull,
  withConnection,
  ynInBind
} from '../../shared/oraclePackageUtils.js';

export { packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

const PKG = 'REC.CREATE_JOB_POSTING_PKG';
const CREATE_PROC = `${PKG}.create_job_posting`;
const UPDATE_PROC = `${PKG}.update_job_posting`;
const PAUSE_PROC = `${PKG}.pause_job_posting`;
const ACTIVATE_PROC = `${PKG}.activate_job_posting`;
const CLOSE_PROC = `${PKG}.close_job_posting`;
const DELETE_PROC = `${PKG}.delete_job_posting`;

const GENERIC_ERROR_MESSAGE = 'Unable to process job posting. Please try again.';

function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function dateInBind(v) {
  return {
    val: parseDate(v),
    dir: oracledb.BIND_IN,
    type: oracledb.DATE
  };
}

function buildPostingFieldBinds(b) {
  return {
    p_posting_title: {
      val: strOrNull(b.posting_title),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_posting_description: {
      val: strOrNull(b.posting_description),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    ...buildContentFieldBinds(b),
    p_visibility_code: {
      val: strOrNull(b.visibility_code),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_start_date: dateInBind(b.start_date),
    p_end_date: dateInBind(b.end_date),
    p_internal_site_flag: ynInBind(b.internal_site_flag, 'N'),
    p_external_site_flag: ynInBind(b.external_site_flag, 'N'),
    p_linkedin_flag: ynInBind(b.linkedin_flag, 'N')
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id       => :p_enterprise_id,
    p_requisition_guid    => :p_requisition_guid,
    p_posting_title       => :p_posting_title,
    p_posting_description => :p_posting_description,
    p_about_the_role      => :p_about_the_role,
    p_responsibilities    => :p_responsibilities,
    p_qualifications      => :p_qualifications,
    p_visibility_code     => :p_visibility_code,
    p_start_date          => :p_start_date,
    p_end_date            => :p_end_date,
    p_internal_site_flag  => :p_internal_site_flag,
    p_external_site_flag  => :p_external_site_flag,
    p_linkedin_flag       => :p_linkedin_flag,
    p_created_by          => :p_created_by,
    p_posting_id          => :p_posting_id,
    p_posting_guid        => :p_posting_guid,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_posting_guid        => :p_posting_guid,
    p_enterprise_id       => :p_enterprise_id,
    p_posting_title       => :p_posting_title,
    p_posting_description => :p_posting_description,
    p_about_the_role      => :p_about_the_role,
    p_responsibilities    => :p_responsibilities,
    p_qualifications      => :p_qualifications,
    p_visibility_code     => :p_visibility_code,
    p_start_date          => :p_start_date,
    p_end_date            => :p_end_date,
    p_internal_site_flag  => :p_internal_site_flag,
    p_external_site_flag  => :p_external_site_flag,
    p_linkedin_flag       => :p_linkedin_flag,
    p_last_updated_by     => :p_last_updated_by,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

function lifecyclePlsql(procName, actorParam) {
  return `
BEGIN
  ${procName}(
    p_enterprise_id  => :p_enterprise_id,
    p_posting_guid   => :p_posting_guid,
    ${actorParam}    => :p_actor,
    p_status         => :p_status,
    p_message        => :p_message
  );
END;`;
}

const PAUSE_PLSQL = lifecyclePlsql(PAUSE_PROC, 'p_paused_by');
const ACTIVATE_PLSQL = lifecyclePlsql(ACTIVATE_PROC, 'p_activated_by');
const CLOSE_PLSQL = lifecyclePlsql(CLOSE_PROC, 'p_closed_by');

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_enterprise_id => :p_enterprise_id,
    p_posting_guid  => :p_posting_guid,
    p_status        => :p_status,
    p_message       => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 */
export async function createJobPostingViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_guid: guidInBind(b.requisition_guid),
    ...buildPostingFieldBinds(b),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_posting_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_posting_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCreateOut(result?.outBinds, {
      idKey: 'p_posting_id',
      guidKey: 'p_posting_guid',
      idField: 'posting_id',
      guidField: 'posting_guid'
    });
  } catch (err) {
    console.error('[recJobPostingsModel] create_job_posting failed:', err?.errorNum ?? '', '[redacted]');
    return {
      posting_id: null,
      posting_guid: null,
      status: 'ERROR',
      message: GENERIC_ERROR_MESSAGE
    };
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function updateJobPostingViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_posting_guid: guidInBind(b.posting_guid),
    ...buildPostingFieldBinds(b),
    p_last_updated_by: {
      val: strOrNull(b.last_updated_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recJobPostingsModel] update_job_posting failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

/**
 * @param {string} postingGuidHex
 * @param {number} enterpriseId
 * @param {string} actor
 */
async function executeLifecycle(plsql, postingGuidHex, enterpriseId, actor) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_posting_guid: guidInBind(postingGuidHex),
    p_actor: { val: strOrNull(actor), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recJobPostingsModel] lifecycle failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}

export function pauseJobPostingViaPackage(postingGuidHex, enterpriseId, pausedBy) {
  return executeLifecycle(PAUSE_PLSQL, postingGuidHex, enterpriseId, pausedBy);
}

export function activateJobPostingViaPackage(postingGuidHex, enterpriseId, activatedBy) {
  return executeLifecycle(ACTIVATE_PLSQL, postingGuidHex, enterpriseId, activatedBy);
}

export function closeJobPostingViaPackage(postingGuidHex, enterpriseId, closedBy) {
  return executeLifecycle(CLOSE_PLSQL, postingGuidHex, enterpriseId, closedBy);
}

/**
 * @param {string} postingGuidHex
 * @param {number} enterpriseId
 */
export async function deleteJobPostingViaPackage(postingGuidHex, enterpriseId) {
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_posting_guid: guidInBind(postingGuidHex),
    ...statusOutBinds()
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recJobPostingsModel] delete_job_posting failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_ERROR_MESSAGE };
  }
}
