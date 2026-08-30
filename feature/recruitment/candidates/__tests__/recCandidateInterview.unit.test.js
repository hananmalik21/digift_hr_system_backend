/**
 * Unit tests for candidate interview validators and response helpers.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ValidationError } from '../../../../utils/errors/index.js';
import { mapRecommendationToResultStatus } from '../utils/recCandidateInterviewConstants.js';
import {
  normalizeScheduleInterviewBody,
  normalizeUpdateInterviewBody,
  parseInterviewGuidParam,
  validateScheduleInterviewBody,
  validateUpdateInterviewBody
} from '../utils/recCandidateInterviewValidators.js';

const VALID_GUID = '550e8400-e29b-41d4-a716-446655440000';
const VALID_GUID_HEX = '550E8400E29B41D4A716446655440000';

describe('parseInterviewGuidParam', () => {
  it('accepts hyphenated GUID strings', () => {
    assert.equal(parseInterviewGuidParam(VALID_GUID), VALID_GUID_HEX);
  });

  it('rejects malformed GUIDs', () => {
    assert.throws(
      () => parseInterviewGuidParam('not-a-guid'),
      (err) => err instanceof ValidationError && err.message.includes('Invalid interview_guid format')
    );
  });
});

describe('validateScheduleInterviewBody', () => {
  const base = {
    enterprise_id: 1,
    candidate_guid: VALID_GUID,
    interview_type: 'TECHNICAL',
    interview_date: '2026-08-30',
    interview_start_utc: '2026-08-30T09:00:00Z',
    interview_end_utc: '2026-08-30T10:00:00Z',
    interviewers: [{ employee_id: 1001, primary_interviewer: 'Y' }],
    created_by: 'TEST.USER'
  };

  it('defaults interview_round to 1', () => {
    const normalized = normalizeScheduleInterviewBody({ ...base });
    assert.equal(normalized.interview_round, 1);
    assert.doesNotThrow(() => validateScheduleInterviewBody(normalized));
  });

  it('rejects end time before start time', () => {
    assert.throws(
      () =>
        validateScheduleInterviewBody({
          ...base,
          interview_start_utc: '2026-08-30T10:00:00Z',
          interview_end_utc: '2026-08-30T09:00:00Z'
        }),
      ValidationError
    );
  });

  it('rejects invalid candidate_guid', () => {
    assert.throws(
      () =>
        validateScheduleInterviewBody({
          ...base,
          candidate_guid: 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz'
        }),
      ValidationError
    );
  });

  it('coerces create_google_meet string/number flags', () => {
    assert.equal(normalizeScheduleInterviewBody({ ...base, create_google_meet: 'true' }).create_google_meet, true);
    assert.equal(normalizeScheduleInterviewBody({ ...base, create_google_meet: 1 }).create_google_meet, true);
    assert.equal(normalizeScheduleInterviewBody({ ...base, create_google_meet: 'false' }).create_google_meet, false);
  });
});

describe('normalizeUpdateInterviewBody interviewers semantics', () => {
  it('omits interviewers when not provided', () => {
    const body = normalizeUpdateInterviewBody({ enterprise_id: 1, updated_by: 'U' }, VALID_GUID_HEX);
    assert.equal(body._interviewers_provided, false);
    assert.equal(body.interviewers, undefined);
  });

  it('marks interviewers provided when key is present', () => {
    const body = normalizeUpdateInterviewBody(
      {
        enterprise_id: 1,
        updated_by: 'U',
        interviewers: [{ employee_id: 1001, primary_interviewer: 'Y' }]
      },
      VALID_GUID_HEX,
      { interviewersProvided: true }
    );
    assert.equal(body._interviewers_provided, true);
    assert.equal(body.interviewers[0].employee_id, 1001);
  });

  it('maps status to status_code', () => {
    const body = normalizeUpdateInterviewBody(
      { enterprise_id: 1, updated_by: 'U', status: 'scheduled' },
      VALID_GUID_HEX
    );
    assert.equal(body.status_code, 'SCHEDULED');
    assert.equal(body.status, undefined);
  });
});

describe('mapRecommendationToResultStatus', () => {
  it('maps HIRE to SELECTED', () => {
    assert.equal(mapRecommendationToResultStatus('HIRE'), 'SELECTED');
  });

  it('maps NO_HIRE to REJECTED', () => {
    assert.equal(mapRecommendationToResultStatus('NO_HIRE'), 'REJECTED');
  });

  it('maps HOLD to ON_HOLD', () => {
    assert.equal(mapRecommendationToResultStatus('HOLD'), 'ON_HOLD');
  });
});
