import oracledb from 'oracledb';
import {
  executePackagePlsql,
  guidInBind,
  jsonArrayToClobString,
  numOrNull,
  packageStatusIsSuccess,
  parseActionOut,
  parseCreateOut,
  statusOutBinds,
  strOrNull
} from '../../shared/oraclePackageUtils.js';
import { normalizeUtcIsoTimestampZ } from '../utils/recInterviewUtcTimestamps.js';
import { INTERVIEW_MUTATION_ERRORS } from '../utils/recCandidateInterviewConstants.js';

export { packageStatusIsSuccess };

const PKG = 'REC.CANDIDATE_INTERVIEW_PKG';
const LOG_TAG = 'recCandidateInterviewModel';
const UTC_TS_FORMAT_Z = `YYYY-MM-DD"T"HH24:MI:SS"Z"`;

function parseDateBind(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const s = String(v).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

function utcTimestampZBind(value) {
  const z = normalizeUtcIsoTimestampZ(value);
  return {
    val: z,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 64
  };
}

function interviewersJsonBind(value) {
  return {
    val: jsonArrayToClobString(value),
    dir: oracledb.BIND_IN,
    type: oracledb.CLOB
  };
}

function enterpriseInBind(enterpriseId) {
  return { val: numOrNull(enterpriseId), dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function buildInterviewGuidBinds(b) {
  return {
    p_enterprise_id: enterpriseInBind(b.enterprise_id),
    p_interview_guid: guidInBind(b.interview_guid)
  };
}

function buildSharedInterviewInBinds(b) {
  return {
    p_interview_title: {
      val: strOrNull(b.interview_title),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 500
    },
    p_interview_type: {
      val: strOrNull(b.interview_type),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 50
    },
    p_interview_round: { val: numOrNull(b.interview_round), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_interview_date: {
      val: parseDateBind(b.interview_date),
      dir: oracledb.BIND_IN,
      type: oracledb.DATE
    },
    p_interview_start_utc: utcTimestampZBind(b.interview_start_utc),
    p_interview_end_utc: utcTimestampZBind(b.interview_end_utc),
    p_interview_mode: {
      val: strOrNull(b.interview_mode),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 20
    },
    p_location: { val: strOrNull(b.location), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_meeting_link: {
      val: strOrNull(b.meeting_link),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 1000
    },
    p_interviewers_json: interviewersJsonBind(b.interviewers)
  };
}

const SCHEDULE_PLSQL = `
BEGIN
  ${PKG}.SCHEDULE_INTERVIEW(
    p_enterprise_id         => :p_enterprise_id,
    p_candidate_guid        => :p_candidate_guid,
    p_interview_title       => :p_interview_title,
    p_interview_type        => :p_interview_type,
    p_interview_round       => :p_interview_round,
    p_interview_date        => :p_interview_date,
    p_interview_start_utc   => TO_TIMESTAMP_TZ(:p_interview_start_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_end_utc     => TO_TIMESTAMP_TZ(:p_interview_end_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_mode        => :p_interview_mode,
    p_location              => :p_location,
    p_meeting_link          => :p_meeting_link,
    p_interviewers_json     => :p_interviewers_json,
    p_created_by            => :p_created_by,
    p_interview_id          => :p_interview_id,
    p_interview_guid        => :p_interview_guid,
    p_status                => :p_status,
    p_message               => :p_message
  );
END;`;

const UPDATE_PLSQL = `
BEGIN
  ${PKG}.UPDATE_INTERVIEW(
    p_enterprise_id         => :p_enterprise_id,
    p_interview_guid        => :p_interview_guid,
    p_interview_title       => :p_interview_title,
    p_interview_type        => :p_interview_type,
    p_interview_round       => :p_interview_round,
    p_interview_date        => :p_interview_date,
    p_interview_start_utc   => TO_TIMESTAMP_TZ(:p_interview_start_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_end_utc     => TO_TIMESTAMP_TZ(:p_interview_end_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_mode        => :p_interview_mode,
    p_location              => :p_location,
    p_meeting_link          => :p_meeting_link,
    p_interviewers_json     => :p_interviewers_json,
    p_status_code           => :p_status_code,
    p_result_status         => :p_result_status,
    p_feedback              => :p_feedback,
    p_rating                => :p_rating,
    p_updated_by            => :p_updated_by,
    p_status                => :p_status,
    p_message               => :p_message
  );
END;`;

const SUBMIT_FEEDBACK_PLSQL = `
BEGIN
  ${PKG}.SUBMIT_FEEDBACK(
    p_enterprise_id       => :p_enterprise_id,
    p_interview_guid      => :p_interview_guid,
    p_overall_rating      => :p_overall_rating,
    p_technical_skills    => :p_technical_skills,
    p_communication       => :p_communication,
    p_culture_fit         => :p_culture_fit,
    p_recommendation      => :p_recommendation,
    p_detailed_comments   => :p_detailed_comments,
    p_created_by          => :p_created_by,
    p_status              => :p_status,
    p_message             => :p_message
  );
END;`;

const DELETE_PLSQL = `
BEGIN
  ${PKG}.DELETE_INTERVIEW(
    p_enterprise_id   => :p_enterprise_id,
    p_interview_guid  => :p_interview_guid,
    p_deleted_by      => :p_deleted_by,
    p_status          => :p_status,
    p_message         => :p_message
  );
END;`;

const SCHEDULE_PARSE_KEYS = {
  idKey: 'p_interview_id',
  guidKey: 'p_interview_guid',
  idField: 'interview_id',
  guidField: 'interview_guid'
};

/**
 * @param {Record<string, unknown>} body
 */
export async function scheduleInterviewViaPackage(body) {
  const b = { ...(body || {}) };
  return executePackagePlsql(
    SCHEDULE_PLSQL,
    {
      p_enterprise_id: enterpriseInBind(b.enterprise_id),
      p_candidate_guid: guidInBind(b.candidate_guid),
      ...buildSharedInterviewInBinds(b),
      p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
      p_interview_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      p_interview_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
      ...statusOutBinds()
    },
    (outBinds) => parseCreateOut(outBinds, SCHEDULE_PARSE_KEYS),
    `${LOG_TAG} SCHEDULE_INTERVIEW`,
    {
      interview_id: null,
      interview_guid: null,
      status: 'ERROR',
      message: INTERVIEW_MUTATION_ERRORS.schedule
    }
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export async function updateInterviewViaPackage(body) {
  const b = { ...(body || {}) };
  return executePackagePlsql(
    UPDATE_PLSQL,
    {
      ...buildInterviewGuidBinds(b),
      ...buildSharedInterviewInBinds(b),
      p_status_code: { val: strOrNull(b.status_code), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
      p_result_status: {
        val: strOrNull(b.result_status),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      },
      p_feedback: { val: strOrNull(b.feedback), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
      p_rating: { val: numOrNull(b.rating), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      p_updated_by: { val: strOrNull(b.updated_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
      ...statusOutBinds()
    },
    parseActionOut,
    `${LOG_TAG} UPDATE_INTERVIEW`,
    { status: 'ERROR', message: INTERVIEW_MUTATION_ERRORS.update }
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export async function submitInterviewFeedbackViaPackage(body) {
  const b = { ...(body || {}) };
  return executePackagePlsql(
    SUBMIT_FEEDBACK_PLSQL,
    {
      ...buildInterviewGuidBinds(b),
      p_overall_rating: { val: numOrNull(b.overall_rating), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
      p_technical_skills: {
        val: strOrNull(b.technical_skills),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      },
      p_communication: {
        val: strOrNull(b.communication),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      },
      p_culture_fit: {
        val: strOrNull(b.culture_fit),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      },
      p_recommendation: {
        val: strOrNull(b.recommendation),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 50
      },
      p_detailed_comments: {
        val: strOrNull(b.detailed_comments ?? b.feedback),
        dir: oracledb.BIND_IN,
        type: oracledb.STRING,
        maxSize: 4000
      },
      p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
      ...statusOutBinds()
    },
    parseActionOut,
    `${LOG_TAG} SUBMIT_FEEDBACK`,
    { status: 'ERROR', message: INTERVIEW_MUTATION_ERRORS.feedback }
  );
}

/**
 * @param {Record<string, unknown>} body
 */
export async function deleteInterviewViaPackage(body) {
  const b = { ...(body || {}) };
  return executePackagePlsql(
    DELETE_PLSQL,
    {
      ...buildInterviewGuidBinds(b),
      p_deleted_by: { val: strOrNull(b.deleted_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
      ...statusOutBinds()
    },
    parseActionOut,
    `${LOG_TAG} DELETE_INTERVIEW`,
    { status: 'ERROR', message: INTERVIEW_MUTATION_ERRORS.delete }
  );
}
