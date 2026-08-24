import test from 'node:test';
import assert from 'node:assert/strict';
import {
  candidateInitials,
  formatDateOnly,
  mapCandidateMatchRow,
  mapEducation,
  mapSkills,
  mapTalentPool
} from '../utils/recCandidateMatchMappers.js';

test('candidate initials use first and last name, skipping middle', () => {
  assert.equal(candidateInitials('Michael', 'Chen', 'Michael Chen'), 'MC');
  assert.equal(candidateInitials('Sarah', 'Williams', null), 'SW');
  assert.equal(candidateInitials('Alex', 'Mercer', 'Alex James Mercer'), 'AM');
  assert.equal(candidateInitials(null, null, 'Alex James Mercer'), 'AM');
});

test('formatDateOnly returns YYYY-MM-DD without a time component', () => {
  assert.equal(formatDateOnly('2026-09-06T21:00:00.000Z'), '2026-09-06');
  const local = new Date(2026, 8, 6, 0, 0, 0);
  assert.equal(formatDateOnly(local), '2026-09-06');
  assert.equal(formatDateOnly(null), null);
});

test('availability display comes from the view, not notice-period rules', async () => {
  const mapped = await mapCandidateMatchRow({
    CANDIDATE_ID: 16,
    CANDIDATE_GUID: '53F8CDD520DAD58AE0631718000ADEDC',
    CANDIDATE_NAME: 'Alex James Mercer',
    FIRST_NAME: 'Alex',
    LAST_NAME: 'Mercer',
    EMAIL: 'alex.mercer@innovate.com',
    PHONE: '+96555123456',
    CURRENT_TITLE: 'Senior Software Engineer',
    CURRENT_EMPLOYER: 'Tech Synergy Ltd',
    CANDIDATE_SUBTITLE: 'Senior Software Engineer at Tech Synergy Ltd',
    YEARS_EXPERIENCE: 6,
    EXPERIENCE_DISPLAY: '6 years',
    CURRENT_LOCATION: 'Austin, TX',
    LOCATION_DISPLAY: 'Austin, TX',
    MATCH_SCORE: 82,
    MATCH_DISPLAY: '82% Match',
    MATCH_LEVEL: 'STRONG',
    RECOMMENDATION_CODE: 'SHORTLIST',
    TITLE_MATCH_SCORE: 88,
    EXPERIENCE_SCORE: 85,
    AVAILABILITY_SCORE: 90,
    RELOCATION_SCORE: 50,
    NOTICE_PERIOD_DAYS: 0,
    AVAILABILITY_CODE: 'IMMEDIATE',
    AVAILABILITY_TEXT: 'Immediate',
    ESTIMATED_AVAILABLE_DATE: '2026-08-23',
    PROFILE_COMPLETENESS_SCORE: 100,
    WILLING_TO_RELOCATE: 'N'
  });

  assert.equal(mapped.initials, 'AM');
  assert.equal(mapped.availability.display, 'Immediate');
  assert.equal(mapped.availability.code, 'IMMEDIATE');
  assert.equal(mapped.availability.score, 90);
  assert.equal(mapped.availability.notice_period_days, 0);
  assert.equal(mapped.availability_text, 'Immediate');
  assert.equal(mapped.availability_code, 'IMMEDIATE');
  assert.equal(mapped.match.display, '82% Match');
  assert.equal(mapped.experience.display, '6 years');
  assert.equal(mapped.candidate_subtitle, 'Senior Software Engineer at Tech Synergy Ltd');
  assert.equal(mapped.already_applied, false);
  assert.equal(mapped.applied_flag, null);
  assert.equal(mapped.can_add_as_applicant, null);
  assert.deepEqual(mapped.application, {
    applied_flag: null,
    application_status: null,
    can_add_as_applicant: null,
    application_count: null,
    application_id: null,
    application_guid: null,
    application_number: null,
    stage_code: null,
    status_code: null,
    applied_date: null
  });
  assert.deepEqual(mapped.skills, []);
  assert.equal(mapped.talent_pool, null);
  assert.equal(mapped.education, null);
});

test('maps WITHIN_2_WEEKS availability directly from the view', async () => {
  const mapped = await mapCandidateMatchRow({
    NOTICE_PERIOD_DAYS: 14,
    ESTIMATED_AVAILABLE_DATE: '2026-09-07',
    AVAILABILITY_SCORE: 90,
    AVAILABILITY_CODE: 'WITHIN_2_WEEKS',
    AVAILABILITY_TEXT: 'Available in 2 weeks'
  });
  assert.deepEqual(mapped.availability, {
    score: 90,
    code: 'WITHIN_2_WEEKS',
    notice_period_days: 14,
    estimated_available_date: '2026-09-07',
    display: 'Available in 2 weeks'
  });
});

test('maps UNKNOWN availability directly from the view', async () => {
  const mapped = await mapCandidateMatchRow({
    NOTICE_PERIOD_DAYS: null,
    ESTIMATED_AVAILABLE_DATE: null,
    AVAILABILITY_SCORE: 50,
    AVAILABILITY_CODE: 'UNKNOWN',
    AVAILABILITY_TEXT: 'Availability unknown'
  });
  assert.deepEqual(mapped.availability, {
    score: 50,
    code: 'UNKNOWN',
    notice_period_days: null,
    estimated_available_date: null,
    display: 'Availability unknown'
  });
});

test('missing location uses Not specified display without inventing availability', async () => {
  const mapped = await mapCandidateMatchRow({
    CANDIDATE_NAME: 'Pat Lee',
    FIRST_NAME: 'Pat',
    LAST_NAME: 'Lee',
    MATCH_SCORE: 40
  });
  assert.equal(mapped.current_location, null);
  assert.equal(mapped.location_display, 'Not specified');
  assert.equal(mapped.availability_code, null);
  assert.equal(mapped.availability_text, null);
  assert.equal(mapped.availability_score, null);
});

test('application status comes from the view, not Node-invented flags', async () => {
  const notApplied = await mapCandidateMatchRow({
    CANDIDATE_GUID: '53F8CDD520DAD58AE0631718000ADEDC',
    APPLIED_FLAG: 'N',
    APPLICATION_STATUS: 'NOT_APPLIED',
    CAN_ADD_AS_APPLICANT: 'Y',
    APPLICATION_COUNT: 0
  });
  assert.equal(notApplied.already_applied, false);
  assert.equal(notApplied.can_add_as_applicant, 'Y');
  assert.deepEqual(notApplied.application, {
    applied_flag: 'N',
    application_status: 'NOT_APPLIED',
    can_add_as_applicant: 'Y',
    application_count: 0,
    application_id: null,
    application_guid: null,
    application_number: null,
    stage_code: null,
    status_code: null,
    applied_date: null
  });

  const applied = await mapCandidateMatchRow({
    CANDIDATE_GUID: '53F8CDD520DAD58AE0631718000ADEDC',
    APPLIED_FLAG: 'Y',
    APPLICATION_STATUS: 'APPLIED',
    CAN_ADD_AS_APPLICANT: 'N',
    APPLICATION_COUNT: 1,
    APPLICATION_ID: 105,
    APPLICATION_GUID: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    APPLICATION_NUMBER: 'APP-2026-000105',
    APPLICATION_STAGE_CODE: 'SCREENING',
    APPLICATION_STATUS_CODE: 'ACTIVE',
    APPLICATION_APPLIED_DATE: '2026-08-20'
  });
  assert.equal(applied.already_applied, true);
  assert.equal(applied.can_add_as_applicant, 'N');
  assert.equal(applied.application_guid, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  assert.equal(applied.application_stage_code, 'SCREENING');
  assert.equal(applied.application_status_code, 'ACTIVE');
  assert.equal(applied.application_applied_date, '2026-08-20');
  assert.deepEqual(applied.application, {
    applied_flag: 'Y',
    application_status: 'APPLIED',
    can_add_as_applicant: 'N',
    application_count: 1,
    application_id: 105,
    application_guid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    application_number: 'APP-2026-000105',
    stage_code: 'SCREENING',
    status_code: 'ACTIVE',
    applied_date: '2026-08-20'
  });
});

test('skills parse Oracle JSON and stay empty when the view has none', () => {
  assert.deepEqual(mapSkills(null, null), []);
  assert.deepEqual(
    mapSkills([{ skill_id: 1, skill_name: 'Python' }, { skill_id: 2, skill_name: 'LangChain' }], null),
    [
      { skill_id: 1, skill_name: 'Python' },
      { skill_id: 2, skill_name: 'LangChain' }
    ]
  );
});

test('talent pool is null unless view columns are present', () => {
  assert.equal(mapTalentPool({}), null);
  assert.deepEqual(
    mapTalentPool({
      talent_pool_id: 10,
      talent_pool_name: 'Software Engineering',
      talent_pool_level: 'Senior Level'
    }),
    {
      talent_pool_id: 10,
      talent_pool_guid: null,
      name: 'Software Engineering',
      level: 'Senior Level',
      display: 'Software Engineering - Senior Level'
    }
  );
});

test('education uses view fields and does not invent a degree', () => {
  assert.equal(mapEducation({}, null), null);
  assert.deepEqual(
    mapEducation(
      {
        highest_education_level: 'MASTER',
        degree_name: "Master's",
        field_of_study: 'Computer Science',
        institution_name: 'Example University'
      },
      null
    ),
    {
      level: 'MASTER',
      degree: "Master's",
      field_of_study: 'Computer Science',
      institution: 'Example University',
      display: "Master's in Computer Science"
    }
  );
});
