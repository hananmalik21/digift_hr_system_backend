import oracledb from 'oracledb';
import db from '../../../../config/db.js';
import { bufferToHex, hexToRawBuffer } from '../../../../utils/guidUtils.js';
import {
  interviewPackageUsesUtcParams,
  interviewUpdateUsesUtcParams,
  normalizeUtcIsoTimestamp,
  normalizeUtcIsoTimestampZ,
  utcIsoToLegacyInterviewFields
} from '../utils/recInterviewUtcTimestamps.js';
import { packageStatusIsSuccess } from './recCandidatesModel.js';

export { packageStatusIsSuccess };

const PKG = 'REC.CANDIDATE_INTERVIEW_PKG';
const SCHEDULE_PROC = `${PKG}.SCHEDULE_INTERVIEW`;
const UPDATE_PROC = `${PKG}.UPDATE_INTERVIEW`;

/** Oracle TO_TIMESTAMP_TZ format for +00:00 offset strings (schedule UTC path). */
const UTC_TS_FORMAT_OFFSET = `YYYY-MM-DD"T"HH24:MI:SSTZH:TZM`;
/** Oracle TO_TIMESTAMP_TZ format for Z-suffix strings (matches deployed UPDATE_INTERVIEW). */
const UTC_TS_FORMAT_Z = `YYYY-MM-DD"T"HH24:MI:SS"Z"`;

const GENERIC_SCHEDULE_ERROR_MESSAGE = 'Unable to schedule interview. Please try again.';
const GENERIC_UPDATE_ERROR_MESSAGE = 'Unable to update interview. Please try again.';

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

function parseDateBind(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  const d = new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

function utcTimestampStringBind(value, { zSuffix = false } = {}) {
  const iso = zSuffix ? normalizeUtcIsoTimestampZ(value) : normalizeUtcIsoTimestamp(value);
  return {
    val: iso,
    dir: oracledb.BIND_IN,
    type: oracledb.STRING,
    maxSize: 64
  };
}

function oraclePlsqlErrorMessage(err, fallback) {
  const msg = err?.message;
  if (!msg) return fallback;
  if (/PLS-00302|UPDATE_INTERVIEW.*must be declared/i.test(msg)) {
    return 'UPDATE_INTERVIEW is not deployed on REC.CANDIDATE_INTERVIEW_PKG for this database.';
  }
  const line = msg.split('\n').find((l) => l.includes('ORA-')) ?? msg.split('\n')[0];
  return line?.replace(/^ORA-\d+:\s*/, '').trim() || fallback;
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

function parseScheduleOut(outBinds) {
  const ob = outBinds || {};
  return {
    interview_id: normalizeOutNumber(ob.p_interview_id),
    interview_guid: normalizeOutGuidHex(ob.p_interview_guid),
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

function parseUpdateOut(outBinds) {
  const ob = outBinds || {};
  return {
    status: normalizeOutString(ob.p_status),
    message: normalizeOutString(ob.p_message) ?? ''
  };
}

function buildSharedInterviewInBinds(b, { useUtcParams, utcZFormat = false }) {
  const shared = {
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
    p_interviewer_name: {
      val: strOrNull(b.interviewer_name),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 200
    },
    p_interviewer_email: {
      val: strOrNull(b.interviewer_email),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 320
    }
  };

  if (useUtcParams) {
    return {
      ...shared,
      p_interview_start_utc: utcTimestampStringBind(b.interview_start_utc, { zSuffix: utcZFormat }),
      p_interview_end_utc: utcTimestampStringBind(b.interview_end_utc, { zSuffix: utcZFormat })
    };
  }

  const startIso = normalizeUtcIsoTimestamp(b.interview_start_utc);
  const endIso = normalizeUtcIsoTimestamp(b.interview_end_utc);
  const legacy =
    startIso && endIso ? utcIsoToLegacyInterviewFields(startIso, endIso) : {};

  return {
    ...shared,
    p_interview_date: {
      val: parseDateBind(legacy.interview_date ?? b.interview_date),
      dir: oracledb.BIND_IN,
      type: oracledb.DATE
    },
    p_start_time: {
      val: strOrNull(legacy.start_time ?? b.start_time),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 20
    },
    p_end_time: {
      val: strOrNull(legacy.end_time ?? b.end_time),
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 20
    }
  };
}

const SCHEDULE_PLSQL_LEGACY = `
BEGIN
  ${SCHEDULE_PROC}(
    p_enterprise_id     => :p_enterprise_id,
    p_candidate_guid    => :p_candidate_guid,
    p_interview_title   => :p_interview_title,
    p_interview_type    => :p_interview_type,
    p_interview_round   => :p_interview_round,
    p_interview_date    => :p_interview_date,
    p_start_time        => :p_start_time,
    p_end_time          => :p_end_time,
    p_interview_mode    => :p_interview_mode,
    p_location          => :p_location,
    p_meeting_link      => :p_meeting_link,
    p_interviewer_name  => :p_interviewer_name,
    p_interviewer_email => :p_interviewer_email,
    p_created_by        => :p_created_by,
    p_interview_id      => :p_interview_id,
    p_interview_guid    => :p_interview_guid,
    p_status            => :p_status,
    p_message           => :p_message
  );
END;`;

const SCHEDULE_PLSQL_UTC = `
BEGIN
  ${SCHEDULE_PROC}(
    p_enterprise_id         => :p_enterprise_id,
    p_candidate_guid        => :p_candidate_guid,
    p_interview_title       => :p_interview_title,
    p_interview_type        => :p_interview_type,
    p_interview_round       => :p_interview_round,
    p_interview_start_utc   => TO_TIMESTAMP_TZ(:p_interview_start_utc, '${UTC_TS_FORMAT_OFFSET}'),
    p_interview_end_utc     => TO_TIMESTAMP_TZ(:p_interview_end_utc, '${UTC_TS_FORMAT_OFFSET}'),
    p_interview_mode        => :p_interview_mode,
    p_location              => :p_location,
    p_meeting_link          => :p_meeting_link,
    p_interviewer_name      => :p_interviewer_name,
    p_interviewer_email     => :p_interviewer_email,
    p_created_by            => :p_created_by,
    p_interview_id          => :p_interview_id,
    p_interview_guid        => :p_interview_guid,
    p_status                => :p_status,
    p_message               => :p_message
  );
END;`;

const UPDATE_PLSQL_LEGACY = `
BEGIN
  ${UPDATE_PROC}(
    p_enterprise_id     => :p_enterprise_id,
    p_interview_guid    => :p_interview_guid,
    p_interview_title   => :p_interview_title,
    p_interview_type    => :p_interview_type,
    p_interview_round   => :p_interview_round,
    p_interview_date    => :p_interview_date,
    p_start_time        => :p_start_time,
    p_end_time          => :p_end_time,
    p_interview_mode    => :p_interview_mode,
    p_location          => :p_location,
    p_meeting_link      => :p_meeting_link,
    p_interviewer_name  => :p_interviewer_name,
    p_interviewer_email => :p_interviewer_email,
    p_status_code       => :p_status_code,
    p_result_status     => :p_result_status,
    p_feedback          => :p_feedback,
    p_rating            => :p_rating,
    p_updated_by        => :p_updated_by,
    p_status            => :p_status,
    p_message           => :p_message
  );
END;`;

const UPDATE_PLSQL_UTC = `
BEGIN
  ${UPDATE_PROC}(
    p_enterprise_id         => :p_enterprise_id,
    p_interview_guid        => :p_interview_guid,
    p_interview_title       => :p_interview_title,
    p_interview_type        => :p_interview_type,
    p_interview_round       => :p_interview_round,
    p_interview_start_utc   => TO_TIMESTAMP_TZ(:p_interview_start_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_end_utc     => TO_TIMESTAMP_TZ(:p_interview_end_utc, '${UTC_TS_FORMAT_Z}'),
    p_interview_mode        => :p_interview_mode,
    p_location              => :p_location,
    p_meeting_link          => :p_meeting_link,
    p_interviewer_name      => :p_interviewer_name,
    p_interviewer_email     => :p_interviewer_email,
    p_status_code           => :p_status_code,
    p_result_status         => :p_result_status,
    p_feedback              => :p_feedback,
    p_rating                => :p_rating,
    p_updated_by            => :p_updated_by,
    p_status                => :p_status,
    p_message               => :p_message
  );
END;`;

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ interview_id: number|null, interview_guid: string|null, status: string, message: string }>}
 */
export async function scheduleInterviewViaPackage(body) {
  const b = { ...(body || {}) };
  const useUtcParams = interviewPackageUsesUtcParams();

  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: {
      val: hexToRawBuffer(b.candidate_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    ...buildSharedInterviewInBinds(b, { useUtcParams }),
    p_created_by: { val: strOrNull(b.created_by), dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 200 },
    p_interview_id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
    p_interview_guid: { dir: oracledb.BIND_OUT, type: oracledb.BUFFER, maxSize: 16 },
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  const plsql = useUtcParams ? SCHEDULE_PLSQL_UTC : SCHEDULE_PLSQL_LEGACY;

  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return parseScheduleOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateInterviewModel] SCHEDULE_INTERVIEW failed:', err?.errorNum ?? '', '[redacted]');
    return {
      interview_id: null,
      interview_guid: null,
      status: 'ERROR',
      message: GENERIC_SCHEDULE_ERROR_MESSAGE
    };
  }
}

/**
 * @param {Record<string, unknown>} body
 * @returns {Promise<{ status: string, message: string }>}
 */
export async function updateInterviewViaPackage(body) {
  const b = { ...(body || {}) };
  const useUtcParams = interviewUpdateUsesUtcParams();

  const binds = {
    p_enterprise_id: { val: numOrNull(b.enterprise_id), dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_interview_guid: {
      val: hexToRawBuffer(b.interview_guid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    ...buildSharedInterviewInBinds(b, { useUtcParams, utcZFormat: useUtcParams }),
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
    p_status: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 20 },
    p_message: { dir: oracledb.BIND_OUT, type: oracledb.STRING, maxSize: 4000 }
  };

  const plsql = useUtcParams ? UPDATE_PLSQL_UTC : UPDATE_PLSQL_LEGACY;

  try {
    const result = await withConnection((connection) =>
      connection.execute(plsql, binds, { autoCommit: true })
    );
    return parseUpdateOut(result?.outBinds);
  } catch (err) {
    console.error('[recCandidateInterviewModel] UPDATE_INTERVIEW failed:', err?.errorNum ?? '', '[redacted]');
    return {
      status: 'ERROR',
      message: oraclePlsqlErrorMessage(err, GENERIC_UPDATE_ERROR_MESSAGE)
    };
  }
}
