/** Oracle view for job posting reads. */
export const REC_JOB_POSTINGS_VIEW = process.env.REC_JOB_POSTINGS_V || 'REC.V_JOB_POSTINGS';

export const REC_CANDIDATES_TABLE = 'REC.CANDIDATES';
export const REC_APPLICATIONS_TABLE = 'REC.REC_APPLICATIONS';

export const LOG_TAG = 'recJobPostingViewModel';

export const READ_ERROR_MESSAGE = 'Unable to retrieve job postings.';
export const MUTATION_ERROR_MESSAGE = 'Unable to process job posting. Please try again.';

export const LIST_SUCCESS_MESSAGE = 'Job postings fetched successfully';
export const DETAIL_SUCCESS_MESSAGE = 'Job posting fetched successfully';
export const NOT_FOUND_MESSAGE = 'Job posting not found.';

export const INVALID_CANDIDATE_GUID_MESSAGE = 'The candidate GUID format is invalid.';
export const CANDIDATE_NOT_FOUND_MESSAGE =
  'Candidate profile was not found for the authenticated user.';

/** Columns selected from REC.V_JOB_POSTINGS (keep in sync with mapper). */
export const JOB_POSTING_VIEW_COLUMNS = [
  'POSTING_ID',
  'POSTING_GUID',
  'ENTERPRISE_ID',
  'REQUISITION_ID',
  'REQUISITION_GUID',
  'REQUISITION_NUMBER',
  'REQUISITION_TITLE',
  'APPROVAL_STATUS_CODE',
  'OPEN_STATUS_CODE',
  'POSTING_TITLE',
  'POSTING_DESCRIPTION',
  'ABOUT_THE_ROLE',
  'RESPONSIBILITIES',
  'QUALIFICATIONS',
  'VISIBILITY_CODE',
  'STATUS_CODE',
  'START_DATE',
  'END_DATE',
  'INTERNAL_SITE_FLAG',
  'EXTERNAL_SITE_FLAG',
  'LINKEDIN_FLAG',
  'POSTED_BY',
  'POSTED_DATE',
  'PAUSED_BY',
  'PAUSED_DATE',
  'CLOSED_BY',
  'CLOSED_DATE',
  'NUMBER_OF_OPENINGS',
  'PRIORITY_CODE',
  'EMPLOYMENT_TYPE_CODE',
  'WORK_MODE_CODE',
  'TARGET_START_DATE',
  'EXPECTED_END_DATE',
  'POSITION_ID',
  'POSITION_NAME',
  'ORG_UNIT_ID',
  'APPLICATION_COUNT',
  'PORTAL_VISIBLE_FLAG',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
];

export const JOB_POSTING_SELECT_SQL = JOB_POSTING_VIEW_COLUMNS.map((c) => `v.${c}`).join(', ');
