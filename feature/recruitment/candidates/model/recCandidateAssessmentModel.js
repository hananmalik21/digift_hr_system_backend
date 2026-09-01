import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToHex, hexToRawBuffer } from '@digifyhr/common';
import { jsonArrayToClobString as sharedJsonArrayToClobString, packageStatusIsSuccess } from '../../shared/oraclePackageUtils.js';

export { packageStatusIsSuccess };

const PKG = 'REC.CANDIDATE_ASSESSMENT_PKG';
const CREATE_PROC = `${PKG}.CREATE_ASSESSMENT`;
const UPDATE_PROC = `${PKG}.UPDATE_ASSESSMENT`;
const DELETE_PROC = `${PKG}.DELETE_ASSESSMENT`;

const GENERIC_CREATE_ERROR_MESSAGE = 'Unable to create assessment. Please try again.';
const GENERIC_UPDATE_ERROR_MESSAGE = 'Unable to update assessment. Please try again.';
const GENERIC_DELETE_ERROR_MESSAGE = 'Unable to delete assessment. Please try again.';

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

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** @param {unknown} value @returns {string|null} */
export function jsonArrayToClobString(value) {
  return sharedJsonArrayToClobString(value);
}

function parseDateBind(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function normalizeOutString(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutString(v[0]);
  const s = String(v).trim();
  return s.length ? s : null;
}

function normalizeOutNumber(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutNumber(v[0]);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeOutGuidHex(v) {
  if (v == null) return null;
  if (Array.isArray(v)) return normalizeOutGuidHex(v[0]);
  return bufferToHex(v);
}

function parseCreateOut(outBinds) {
  const ob = outBinds || {};
  return {
    assessment_id: normalizeOutNumber(ob.p_assessment_id),
    assessment_guid: normalizeOutGuidHex(ob.p_assessment_guid),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

function parseActionOut(outBinds) {
  const ob = outBinds || {};
  return {
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

function buildAssessmentFieldBinds(b) {
  return {
    p_assessment_type: {
      val: strOrNull(b.assessment_type),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_assessment_template: {
      val: strOrNull(b.assessment_template),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_platform: { val: strOrNull(b.platform), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_difficulty_level: {
      val: strOrNull(b.difficulty_level),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_duration_minutes: { val: numOrNull(b.duration_minutes), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_completion_due_date: {
      val: parseDateBind(b.completion_due_date),
      dir: oracledb.BIND_IN,
      type: oracledb.DATE
    },
    p_skills_json: {
      val: jsonArrayToClobString(b.skills_json),
      dir: oracledb.BIND_IN,
      type: oracledb.CLOB
    },
    p_instructions: {
      val: strOrNull(b.instructions),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 4000
    }
  };
}

const CREATE_PLSQL = `
BEGIN
  ${CREATE_PROC}(
    p_enterprise_id       => :p_enterprise_id,
    p_candidate_guid      => :p_candidate_guid,
    p_assessment_type     => :p_assessment_type,
    p_assessment_template => :p_assessment_template,
    p_platform            => :p_platform,
    p_difficulty_level    => :p_difficulty_level,
    p_duration_minutes    => :p_duration_minutes,
    p_completion_due_date => :p_completion_due_date,
    p_skills_json         => :p_skills_json,
    p_instructions        => :p_instructions,
    p_created_by          => :p_created_by,
    p_assessment_id       => :p_assessment_id,
    p_assessment_guid     => :p_assessment_guid,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${UPDATE_PROC}(
    p_enterprise_id       => :p_enterprise_id,
    p_assessment_guid     => :p_assessment_guid,
    p_assessment_type     => :p_assessment_type,
    p_assessment_template => :p_assessment_template,
    p_platform            => :p_platform,
    p_difficulty_level    => :p_difficulty_level,
    p_duration_minutes    => :p_duration_minutes,
    p_completion_due_date => :p_completion_due_date,
    p_skills_json         => :p_skills_json,
    p_instructions        => :p_instructions,
    p_status_code         => :p_status_code,
    p_updated_by          => :p_updated_by,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${DELETE_PROC}(
    p_enterprise_id   => :p_enterprise_id,
    p_assessment_guid => :p_assessment_guid,
    p_deleted_by      => :p_deleted_by,
    p_status          => :p_status,
    p_message         => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 */
export async function createAssessmentViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: {
      val: hexToRawBuffer(b.candidate_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    ...buildAssessmentFieldBinds(b),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_assessment_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_assessment_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(CREATE_PLSQL, binds, { autoCommit: true })
    );
    return parseCreateOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateAssessmentModel] CREATE_ASSESSMENT failed:', err?.errorNum ?? '', '[redacted]');
    return {
      assessment_id: null,
      assessment_guid: null,
      status: 'ERROR',
      message: GENERIC_CREATE_ERROR_MESSAGE
    };
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function updateAssessmentViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_assessment_guid: {
      val: hexToRawBuffer(b.assessment_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    ...buildAssessmentFieldBinds(b),
    p_status_code: { val: strOrNull(b.status_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(UPDATE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateAssessmentModel] UPDATE_ASSESSMENT failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_UPDATE_ERROR_MESSAGE };
  }
}

/**
 * @param {Record<string, unknown>} body
 */
export async function deleteAssessmentViaPackage(body) {
  const b = { ...(body || {}) };
  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_assessment_guid: {
      val: hexToRawBuffer(b.assessment_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_deleted_by: { val: strOrNull(b.deleted_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  try {
    const result = await withConnection((connection) =>
      connection.execute(DELETE_PLSQL, binds, { autoCommit: true })
    );
    return parseActionOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateAssessmentModel] DELETE_ASSESSMENT failed:', err?.errorNum ?? '', '[redacted]');
    return { status: 'ERROR', message: GENERIC_DELETE_ERROR_MESSAGE };
  }
}
