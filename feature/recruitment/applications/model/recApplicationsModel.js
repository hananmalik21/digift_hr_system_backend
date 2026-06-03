import oracledb from 'oracledb';
import {
  clobInBind,
  codeInBind,
  executePackagePlsql,
  guidInBind,
  normalizeOutGuidHex,
  normalizeOutNumber,
  normalizeOutString,
  numOrNull,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull,
  ynInBind
} from '../../shared/oraclePackageUtils.js';
import { parseResumeFileContent } from '../../shared/recResumeFileUtils.js';
import { NOTE_MUTATION_ERROR_MESSAGE, MUTATION_ERROR_MESSAGE } from '../utils/recApplicationConstants.js';

const PKG = 'REC.CREATE_APPLICATION_PKG';
const LOG = 'recApplicationsModel';

const GENERIC_APP_ERROR = MUTATION_ERROR_MESSAGE;
const GENERIC_NOTE_ERROR = NOTE_MUTATION_ERROR_MESSAGE;

const ACTION_ERROR = { status: 'ERROR', message: GENERIC_APP_ERROR };
const NOTE_ACTION_ERROR = { status: 'ERROR', message: GENERIC_NOTE_ERROR };
const NOTE_CREATE_ERROR = {
  note_id: null,
  note_guid: null,
  status: 'ERROR',
  message: GENERIC_NOTE_ERROR
};

/**
 * @param {Record<string, unknown>|undefined} outBinds
 */
function parseApplyJobOut(outBinds) {
  const ob = outBinds || {};
  return {
    application_id: normalizeOutNumber(ob.p_application_id),
    application_guid: normalizeOutGuidHex(ob.p_application_guid),
    application_number: normalizeOutString(ob.p_application_number),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

const APPLY_PLSQL = `
BEGIN
  ${PKG}.apply_job(
    p_enterprise_id        => :p_enterprise_id,
    p_posting_guid         => :p_posting_guid,
    p_candidate_guid       => :p_candidate_guid,
    p_source_code          => :p_source_code,
    p_resume_file_name     => :p_resume_file_name,
    p_resume_file_type     => :p_resume_file_type,
    p_resume_file_size     => :p_resume_file_size,
    p_resume_file_content  => :p_resume_file_content,
    p_created_by           => :p_created_by,
    p_application_id       => :p_application_id,
    p_application_guid     => :p_application_guid,
    p_application_number   => :p_application_number,
    p_status               => :p_status,
    p_message              => :p_message
  );
END;`;

const CHANGE_STAGE_PLSQL = `
BEGIN
  ${PKG}.change_application_stage(
    p_application_guid    => :p_application_guid,
    p_enterprise_id       => :p_enterprise_id,
    p_current_stage_code  => :p_current_stage_code,
    p_comments            => :p_comments,
    p_updated_by          => :p_updated_by,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

const REJECT_PLSQL = `
BEGIN
  ${PKG}.reject_application(
    p_application_guid       => :p_application_guid,
    p_enterprise_id          => :p_enterprise_id,
    p_rejection_reason_code  => :p_rejection_reason_code,
    p_rejection_comments     => :p_rejection_comments,
    p_send_email_flag        => :p_send_email_flag,
    p_rejected_by            => :p_rejected_by,
    p_status                 => :p_status,
    p_message                => :p_message
  );
END;`;

const ADD_NOTE_PLSQL = `
BEGIN
  ${PKG}.add_application_note(
    p_application_guid => :p_application_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_note_type_code   => :p_note_type_code,
    p_note_text        => :p_note_text,
    p_private_flag     => :p_private_flag,
    p_created_by       => :p_created_by,
    p_note_id          => :p_note_id,
    p_note_guid        => :p_note_guid,
    p_status           => :p_status,
    p_message          => :p_message
  );
END;`;

const UPDATE_NOTE_PLSQL = `
BEGIN
  ${PKG}.update_application_note(
    p_note_guid        => :p_note_guid,
    p_enterprise_id    => :p_enterprise_id,
    p_note_type_code   => :p_note_type_code,
    p_note_text        => :p_note_text,
    p_private_flag     => :p_private_flag,
    p_last_updated_by  => :p_last_updated_by,
    p_status           => :p_status,
    p_message          => :p_message
  );
END;`;

const DELETE_NOTE_PLSQL = `
BEGIN
  ${PKG}.delete_application_note(
    p_note_guid     => :p_note_guid,
    p_enterprise_id => :p_enterprise_id,
    p_status        => :p_status,
    p_message       => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @param {string} postingGuidHex
 */
export async function applyJobViaPackage(body, postingGuidHex) {
  const b = { ...(body || {}) };
  const fileBuf = parseResumeFileContent(
    b.resume_file_content ?? b.resumeFileContent ?? b.file_content ?? b.fileContent
  );

  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_posting_guid: guidInBind(postingGuidHex),
    p_candidate_guid: guidInBind(b.candidate_guid),
    p_source_code: codeInBind(b.source_code),
    p_resume_file_name: {
      val: strOrNull(b.resume_file_name ?? b.file_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_resume_file_type: {
      val: strOrNull(b.resume_file_type ?? b.file_type ?? b.mime_type),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_resume_file_size: {
      val: numOrNull(b.resume_file_size ?? b.file_size),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    p_created_by: {
      val: strOrNull(b.created_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_application_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_application_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_application_number: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 50 },
    ...statusOutBinds()
  };

  if (fileBuf != null) {
    binds.p_resume_file_content = { val: fileBuf, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  } else {
    binds.p_resume_file_content = { val: null, dir: oracledb.BIND_IN, type: oracledb.BLOB };
  }

  return executePackagePlsql(APPLY_PLSQL, binds, parseApplyJobOut, `${LOG} apply_job`, {
    application_id: null,
    application_guid: null,
    application_number: null,
    status: 'ERROR',
    message: GENERIC_APP_ERROR
  });
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export async function changeApplicationStageViaPackage(body, applicationGuidHex) {
  const b = { ...(body || {}) };
  const binds = {
    p_application_guid: guidInBind(applicationGuidHex),
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_current_stage_code: codeInBind(b.current_stage_code),
    p_comments: {
      val: strOrNull(b.comments),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    },
    p_updated_by: {
      val: strOrNull(b.updated_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    CHANGE_STAGE_PLSQL,
    binds,
    parseActionOut,
    `${LOG} change_application_stage`,
    ACTION_ERROR
  );
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export async function rejectApplicationViaPackage(body, applicationGuidHex) {
  const b = { ...(body || {}) };
  const binds = {
    p_application_guid: guidInBind(applicationGuidHex),
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_rejection_reason_code: codeInBind(b.rejection_reason_code),
    p_rejection_comments: clobInBind(b.rejection_comments),
    p_send_email_flag: ynInBind(b.send_email_flag, 'N'),
    p_rejected_by: {
      val: strOrNull(b.rejected_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    REJECT_PLSQL,
    binds,
    parseActionOut,
    `${LOG} reject_application`,
    ACTION_ERROR
  );
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} applicationGuidHex
 */
export async function addApplicationNoteViaPackage(body, applicationGuidHex) {
  const b = { ...(body || {}) };
  const binds = {
    p_application_guid: guidInBind(applicationGuidHex),
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_note_type_code: codeInBind(b.note_type_code),
    p_note_text: clobInBind(b.note_text),
    p_private_flag: ynInBind(b.private_flag, 'N'),
    p_created_by: {
      val: strOrNull(b.created_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_note_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_note_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    ADD_NOTE_PLSQL,
    binds,
    (out) =>
      parseCreateOut(out, {
        idKey: 'p_note_id',
        guidKey: 'p_note_guid',
        idField: 'note_id',
        guidField: 'note_guid'
      }),
    `${LOG} add_application_note`,
    NOTE_CREATE_ERROR
  );
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} noteGuidHex
 */
export async function updateApplicationNoteViaPackage(body, noteGuidHex) {
  const b = { ...(body || {}) };
  const binds = {
    p_note_guid: guidInBind(noteGuidHex),
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_note_type_code: codeInBind(b.note_type_code),
    p_note_text: clobInBind(b.note_text),
    p_private_flag: ynInBind(b.private_flag),
    p_last_updated_by: {
      val: strOrNull(b.last_updated_by),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    UPDATE_NOTE_PLSQL,
    binds,
    parseActionOut,
    `${LOG} update_application_note`,
    NOTE_ACTION_ERROR
  );
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} noteGuidHex
 */
export async function deleteApplicationNoteViaPackage(body, noteGuidHex) {
  const binds = {
    p_note_guid: guidInBind(noteGuidHex),
    p_enterprise_id: {
      val: numOrNull(body?.enterprise_id),
      dir: oracledb.BIND_IN,
      type: oracledb.NUMBER
    },
    ...statusOutBinds()
  };

  return executePackagePlsql(
    DELETE_NOTE_PLSQL,
    binds,
    parseActionOut,
    `${LOG} delete_application_note`,
    NOTE_ACTION_ERROR
  );
}
