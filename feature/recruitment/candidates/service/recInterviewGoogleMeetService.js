import { AppError } from '../../../../utils/errors/index.js';
import { sanitizeGoogleError } from '../../../../utils/sanitizeGoogleError.js';
import EmployeeModel from '../../../employee_management/employees/model/employeeModel.js';
import { createConferenceRequestId } from '../../../integrations/google/model/googleIntegrationModel.js';
import { getGoogleOAuthCalendarClient } from '../../../integrations/google/service/googleOAuthService.js';
import { getCandidateByGuidFromView } from '../model/recCandidateViewModel.js';
import {
  getInterviewMeetingMetadata,
  updateInterviewMeetingMetadata
} from '../model/recCandidateInterviewMeetingModel.js';

const LOG_TAG = 'recInterviewGoogleMeetService';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const MEETING_PROVIDER = 'GOOGLE_MEET';
const MEETING_SUMMARY_PREFIX = process.env.GOOGLE_MEET_SUMMARY_PREFIX?.trim() || 'Digify HR';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Manual meeting_link for schedules that do not create Google Meet.
 * @param {Record<string, unknown>} body
 * @returns {string|null}
 */
export function resolveMeetingLinkForSchedule(body) {
  const existingLink = body.meeting_link != null ? String(body.meeting_link).trim() : '';
  return existingLink || null;
}

/**
 * @param {unknown} email
 */
function isValidEmail(email) {
  if (email == null) return false;
  const value = String(email).trim();
  return value !== '' && EMAIL_RE.test(value);
}

/**
 * @param {Array<{ employee_id?: number|string }>} interviewers
 * @param {number} enterpriseId
 */
async function resolveInterviewerEmails(interviewers, enterpriseId) {
  const emails = [];
  for (const item of interviewers || []) {
    const employeeId = Number(item?.employee_id);
    if (!Number.isFinite(employeeId) || employeeId < 1) continue;
    const employee = await EmployeeModel.findById(enterpriseId, employeeId);
    const email = employee?.email ?? employee?.EMAIL ?? null;
    if (isValidEmail(email)) emails.push(String(email).trim().toLowerCase());
  }
  return [...new Set(emails)];
}

/**
 * @param {import('googleapis').calendar_v3.Schema$Event} event
 */
function extractMeetDetails(event) {
  const meetingUrl =
    event.hangoutLink ??
    event.conferenceData?.entryPoints?.find((entry) => entry.entryPointType === 'video')?.uri ??
    null;

  const meetCode = meetingUrl
    ? meetingUrl.replace(/^https?:\/\/meet\.google\.com\//i, '').split('?')[0]
    : event.conferenceData?.conferenceId ?? null;

  return {
    meetingUrl,
    meetCode,
    calendarUrl: event.htmlLink ?? null
  };
}

/**
 * @param {import('googleapis').calendar_v3.Calendar} calendar
 * @param {string} calendarId
 * @param {string} eventId
 */
async function waitForMeetUrl(calendar, calendarId, eventId) {
  const attempts = 5;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await calendar.events.get({ calendarId, eventId });
    const details = extractMeetDetails(response.data ?? {});
    if (details.meetingUrl) {
      return { event: response.data, ...details };
    }
    await sleep(400 * (attempt + 1));
  }
  return null;
}

/**
 * @param {{
 *   req: import('express').Request,
 *   body: Record<string, unknown>,
 *   interviewGuid: string,
 *   enterpriseId: number,
 *   actor: string
 * }} params
 */
export async function createGoogleMeetForInterview(params) {
  const { req, body, interviewGuid, enterpriseId, actor } = params;

  const existing = await getInterviewMeetingMetadata(interviewGuid, enterpriseId);
  if (
    existing?.meeting_provider === MEETING_PROVIDER &&
    existing?.google_event_id &&
    existing?.meeting_link
  ) {
    throw new AppError(
      'A Google Meet already exists for this interview.',
      409,
      'MEETING_ALREADY_EXISTS'
    );
  }

  const userId = Number(req.user?.user_id ?? req.user?.id);
  if (!Number.isFinite(userId) || userId < 1) {
    throw new AppError('Authenticated user context is required.', 401, 'GOOGLE_NOT_CONNECTED');
  }

  const { calendar, calendarId, organizerEmail } = await getGoogleOAuthCalendarClient({
    enterpriseId,
    userId,
    actor
  });

  const candidate = await getCandidateByGuidFromView(String(body.candidate_guid), enterpriseId);
  const candidateEmail = candidate?.email ?? null;
  if (!isValidEmail(candidateEmail)) {
    throw new AppError(
      'Candidate email address was not found for Google Calendar invitations.',
      400,
      'CANDIDATE_EMAIL_NOT_FOUND'
    );
  }

  const interviewerEmails = await resolveInterviewerEmails(
    /** @type {Array<{ employee_id?: number|string }>} */ (body.interviewers),
    enterpriseId
  );

  const attendeeEmails = [...new Set([String(candidateEmail).trim().toLowerCase(), ...interviewerEmails])];
  const candidateName =
    candidate?.candidate_name ??
    ([candidate?.first_name, candidate?.last_name].filter(Boolean).join(' ').trim() || 'Candidate');

  const interviewType = String(body.interview_type ?? 'Interview').trim();
  const round = body.interview_round != null ? ` - Round ${body.interview_round}` : '';
  const summary = `${MEETING_SUMMARY_PREFIX} - ${interviewType} Interview - ${candidateName}${round}`;
  const description = [
    `Interview type: ${interviewType}`,
    body.interview_title ? `Title: ${body.interview_title}` : null,
    `Candidate: ${candidateName}`
  ]
    .filter(Boolean)
    .join('\n');

  const startUtc = String(body.interview_start_utc ?? '').trim();
  const endUtc = String(body.interview_end_utc ?? '').trim();
  if (!startUtc || !endUtc || Date.parse(endUtc) <= Date.parse(startUtc)) {
    throw new AppError(
      'Interview end time must be after start time.',
      400,
      'INVALID_INTERVIEW_DATE_RANGE'
    );
  }

  let createdEvent;
  try {
    const insertResponse = await calendar.events.insert({
      calendarId,
      conferenceDataVersion: 1,
      sendUpdates: 'all',
      requestBody: {
        summary,
        description,
        start: { dateTime: startUtc, timeZone: 'UTC' },
        end: { dateTime: endUtc, timeZone: 'UTC' },
        attendees: attendeeEmails.map((email) => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: createConferenceRequestId(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }
    });
    createdEvent = insertResponse.data;
  } catch (err) {
    console.error(`[${LOG_TAG}] calendar event insert failed`, sanitizeGoogleError(err));
    throw new AppError(
      'Unable to create Google Calendar event for this interview.',
      502,
      'GOOGLE_CALENDAR_EVENT_CREATION_FAILED',
      sanitizeGoogleError(err)
    );
  }

  const eventId = createdEvent?.id;
  if (!eventId) {
    throw new AppError(
      'Google Calendar event was created without an event ID.',
      502,
      'GOOGLE_MEET_CREATION_FAILED'
    );
  }

  let meetDetails = extractMeetDetails(createdEvent);
  if (!meetDetails.meetingUrl) {
    const resolved = await waitForMeetUrl(calendar, calendarId, eventId);
    if (!resolved?.meetingUrl) {
      try {
        await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' });
      } catch (deleteErr) {
        console.error(`[${LOG_TAG}] compensation delete failed`, {
          eventId,
          detail: sanitizeGoogleError(deleteErr)
        });
      }
      throw new AppError(
        'Google Meet link is not available for the created calendar event.',
        502,
        'GOOGLE_MEET_URL_NOT_AVAILABLE'
      );
    }
    meetDetails = resolved;
  }

  const saved = await updateInterviewMeetingMetadata({
    enterprise_id: enterpriseId,
    interview_guid: interviewGuid,
    meeting_link: meetDetails.meetingUrl,
    meeting_provider: MEETING_PROVIDER,
    google_event_id: eventId,
    google_meet_code: meetDetails.meetCode,
    google_calendar_url: meetDetails.calendarUrl,
    google_organizer_email: organizerEmail,
    meeting_status: 'CREATED',
    updated_by: actor
  });

  if (!saved) {
    try {
      await calendar.events.delete({ calendarId, eventId, sendUpdates: 'none' });
    } catch (deleteErr) {
      console.error(`[${LOG_TAG}] compensation delete after DB failure`, {
        eventId,
        interviewGuid,
        detail: sanitizeGoogleError(deleteErr)
      });
    }
    throw new AppError(
      'Interview was created but Google meeting metadata could not be saved.',
      500,
      'INTERVIEW_MEETING_UPDATE_FAILED'
    );
  }

  return {
    provider: MEETING_PROVIDER,
    meeting_url: meetDetails.meetingUrl,
    meeting_code: meetDetails.meetCode,
    google_event_id: eventId,
    calendar_url: meetDetails.calendarUrl,
    organizer_email: organizerEmail,
    meeting_status: 'CREATED'
  };
}
