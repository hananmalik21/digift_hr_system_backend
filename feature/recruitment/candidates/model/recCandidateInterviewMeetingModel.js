import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { withConnection, ROW_OPTS } from '../../shared/recViewModelUtils.js';

const TABLE = 'REC.CANDIDATE_INTERVIEWS';

/**
 * @param {string} interviewGuidHex
 * @param {number} enterpriseId
 */
export async function getInterviewMeetingMetadata(interviewGuidHex, enterpriseId) {
  const sql = `
    SELECT MEETING_LINK,
           MEETING_PROVIDER,
           GOOGLE_EVENT_ID,
           GOOGLE_MEET_CODE,
           GOOGLE_CALENDAR_URL,
           GOOGLE_ORGANIZER_EMAIL,
           MEETING_STATUS
      FROM ${TABLE}
     WHERE ENTERPRISE_ID = :p_enterprise_id
       AND INTERVIEW_GUID = :p_interview_guid
     FETCH FIRST 1 ROWS ONLY`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
        p_interview_guid: {
          val: hexToRawBuffer(interviewGuidHex),
          dir: oracledb.BIND_IN,
          type: oracledb.BUFFER,
          maxSize: 16
        }
      },
      ROW_OPTS
    );
    const row = result.rows?.[0];
    if (!row) return null;
    return {
      meeting_link: row.MEETING_LINK ?? row.meeting_link ?? null,
      meeting_provider: row.MEETING_PROVIDER ?? row.meeting_provider ?? null,
      google_event_id: row.GOOGLE_EVENT_ID ?? row.google_event_id ?? null,
      google_meet_code: row.GOOGLE_MEET_CODE ?? row.google_meet_code ?? null,
      google_calendar_url: row.GOOGLE_CALENDAR_URL ?? row.google_calendar_url ?? null,
      google_organizer_email: row.GOOGLE_ORGANIZER_EMAIL ?? row.google_organizer_email ?? null,
      meeting_status: row.MEETING_STATUS ?? row.meeting_status ?? null
    };
  });
}

/**
 * @param {{
 *   enterprise_id: number,
 *   interview_guid: string,
 *   meeting_link?: string|null,
 *   meeting_provider?: string|null,
 *   google_event_id?: string|null,
 *   google_meet_code?: string|null,
 *   google_calendar_url?: string|null,
 *   google_organizer_email?: string|null,
 *   meeting_status?: string|null,
 *   updated_by?: string|null
 * }} payload
 */
export async function updateInterviewMeetingMetadata(payload) {
  const sql = `
    UPDATE ${TABLE}
       SET MEETING_LINK = :p_meeting_link,
           MEETING_PROVIDER = :p_meeting_provider,
           GOOGLE_EVENT_ID = :p_google_event_id,
           GOOGLE_MEET_CODE = :p_google_meet_code,
           GOOGLE_CALENDAR_URL = :p_google_calendar_url,
           GOOGLE_ORGANIZER_EMAIL = :p_google_organizer_email,
           MEETING_STATUS = :p_meeting_status,
           MEETING_CREATED_DATE = CASE
             WHEN :p_meeting_status = 'CREATED' THEN SYSTIMESTAMP
             ELSE MEETING_CREATED_DATE
           END,
           LAST_UPDATED_BY = :p_updated_by,
           LAST_UPDATE_DATE = SYSDATE
     WHERE ENTERPRISE_ID = :p_enterprise_id
       AND INTERVIEW_GUID = :p_interview_guid`;

  return withConnection(async (connection) => {
    const result = await connection.execute(
      sql,
      {
        p_meeting_link: {
          val: payload.meeting_link ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 1000
        },
        p_meeting_provider: {
          val: payload.meeting_provider ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 50
        },
        p_google_event_id: {
          val: payload.google_event_id ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 255
        },
        p_google_meet_code: {
          val: payload.google_meet_code ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 100
        },
        p_google_calendar_url: {
          val: payload.google_calendar_url ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 1000
        },
        p_google_organizer_email: {
          val: payload.google_organizer_email ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 320
        },
        p_meeting_status: {
          val: payload.meeting_status ?? null,
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 50
        },
        p_updated_by: {
          val: payload.updated_by ?? 'SYSTEM',
          dir: oracledb.BIND_IN,
          type: oracledb.STRING,
          maxSize: 200
        },
        p_enterprise_id: {
          val: payload.enterprise_id,
          dir: oracledb.BIND_IN,
          type: oracledb.NUMBER
        },
        p_interview_guid: {
          val: hexToRawBuffer(payload.interview_guid),
          dir: oracledb.BIND_IN,
          type: oracledb.BUFFER,
          maxSize: 16
        }
      },
      { autoCommit: true }
    );

    return Number(result.rowsAffected ?? 0) > 0;
  });
}
