/** Oracle view for application reads. */
export const REC_APPLICATIONS_VIEW = process.env.REC_APPLICATIONS_V || 'REC.V_APPLICATIONS';

export const LOG_TAG = 'recApplicationViewModel';

export const READ_ERROR_MESSAGE = 'Unable to fetch applications. Please try again.';
export const LIST_SUCCESS_MESSAGE = 'Applications fetched successfully';
export const MUTATION_ERROR_MESSAGE = 'Unable to process application. Please try again.';
export const APPLY_ERROR_MESSAGE = 'Unable to submit application. Please try again.';

export const NOT_FOUND_MESSAGE = 'Application not found.';

export const APPLY_SUCCESS_MESSAGE = 'Application submitted successfully.';

export const CHANGE_STAGE_SUCCESS_MESSAGE = 'Application stage updated successfully.';

export const REJECT_SUCCESS_MESSAGE = 'Application rejected successfully.';

/** Oracle reject_application business errors (keep in sync with package). */
export const REJECT_ERROR_NOT_FOUND = 'Application does not exist.';
export const REJECT_ERROR_ALREADY_REJECTED = 'Application is already rejected.';
export const REJECT_ERROR_HIRED = 'Hired application cannot be rejected.';
export const REJECT_ERROR_REASON_REQUIRED = 'Rejection reason is required.';

/** Rejection reason dropdown (keep in sync with Oracle / frontend). */
export const VALID_REJECTION_REASON_CODES = [
  'NOT_MATCHING_REQUIREMENTS',
  'INSUFFICIENT_EXPERIENCE',
  'FAILED_INTERVIEW',
  'SALARY_EXPECTATION',
  'POSITION_CLOSED',
  'OVERQUALIFIED',
  'UNDERQUALIFIED',
  'CULTURE_MISMATCH',
  'NO_SHOW',
  'OTHER'
];

/** Shared max length for comments, rejection notes, and note text. */
export const TEXT_FIELD_MAX_LEN = 4000;

export const REJECTION_COMMENTS_MAX_LEN = TEXT_FIELD_MAX_LEN;

export const REC_APPLICATION_STAGE_HISTORY_VIEW =
  process.env.REC_APPLICATION_STAGE_HISTORY_V || 'REC.V_APPLICATION_STAGE_HISTORY';

export const STAGE_HISTORY_READ_ERROR_MESSAGE =
  'Unable to fetch application stage history. Please try again.';

export const STAGE_HISTORY_LIST_SUCCESS_MESSAGE = 'Application stage history fetched successfully';

/** Max rows embedded on application detail timeline. */
export const STAGE_HISTORY_DETAIL_MAX_ROWS = 100;

/** Columns from REC.V_APPLICATION_STAGE_HISTORY (keep in sync with mapper). */
export const STAGE_HISTORY_VIEW_COLUMNS = [
  'STAGE_HISTORY_ID',
  'STAGE_HISTORY_GUID',
  'ENTERPRISE_ID',
  'APPLICATION_ID',
  'APPLICATION_GUID',
  'APPLICATION_NUMBER',
  'CANDIDATE_ID',
  'CANDIDATE_GUID',
  'CANDIDATE_NAME',
  'POSTING_ID',
  'POSTING_GUID',
  'POSTING_TITLE',
  'REQUISITION_ID',
  'REQUISITION_GUID',
  'REQUISITION_NUMBER',
  'REQUISITION_TITLE',
  'FROM_STAGE_CODE',
  'TO_STAGE_CODE',
  'FROM_STATUS_CODE',
  'TO_STATUS_CODE',
  'COMMENTS',
  'CREATED_BY',
  'CREATION_DATE'
];

export const STAGE_HISTORY_SELECT_SQL = STAGE_HISTORY_VIEW_COLUMNS.map((c) => `v.${c}`).join(', ');

/** Valid recruitment pipeline stages (REJECTED is terminal from any stage). */
export const VALID_STAGE_CODES = [
  'APPLIED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'SELECTED',
  'HIRED',
  'REJECTED'
];

/** Columns from REC.V_APPLICATIONS (keep in sync with mapper). */
export const APPLICATION_VIEW_COLUMNS = [
  'APPLICATION_ID',
  'APPLICATION_GUID',
  'APPLICATION_NUMBER',
  'ENTERPRISE_ID',
  'POSTING_ID',
  'POSTING_GUID',
  'POSTING_TITLE',
  'REQUISITION_ID',
  'REQUISITION_GUID',
  'REQUISITION_NUMBER',
  'REQUISITION_TITLE',
  'CANDIDATE_ID',
  'CANDIDATE_GUID',
  'FIRST_NAME',
  'MIDDLE_NAME',
  'LAST_NAME',
  'CANDIDATE_NAME',
  'EMAIL',
  'PHONE',
  'CURRENT_TITLE',
  'CURRENT_EMPLOYER',
  'YEARS_EXPERIENCE',
  'CURRENT_LOCATION',
  'CURRENT_SALARY',
  'EXPECTED_SALARY',
  'SALARY_CURRENCY',
  'NOTICE_PERIOD',
  'LINKEDIN_PROFILE',
  'PORTFOLIO_LINK',
  'GITHUB_LINK',
  'WILLING_TO_RELOCATE',
  'SOURCE_CODE',
  'CURRENT_STAGE_CODE',
  'STATUS_CODE',
  'APPLIED_DATE',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE',
  'REJECTION_REASON_CODE',
  'REJECTION_COMMENTS',
  'REJECTION_EMAIL_FLAG'
];

export const APPLICATION_SELECT_SQL = APPLICATION_VIEW_COLUMNS.map((c) =>
  c === 'REJECTION_COMMENTS'
    ? `DBMS_LOB.SUBSTR(v.REJECTION_COMMENTS, ${TEXT_FIELD_MAX_LEN}, 1) AS REJECTION_COMMENTS`
    : `v.${c}`
).join(', ');

export const REC_APPLICATION_NOTES_TABLE =
  process.env.REC_APPLICATION_NOTES_TABLE || 'REC.REC_APPLICATION_NOTES';

export const REC_APPLICATIONS_TABLE =
  process.env.REC_APPLICATIONS_TABLE || 'REC.REC_APPLICATIONS';

export const NOTE_MUTATION_ERROR_MESSAGE =
  'Unable to process application note. Please try again.';

export const NOTE_ADD_SUCCESS_MESSAGE = 'Application note added successfully.';

export const NOTE_UPDATE_SUCCESS_MESSAGE = 'Application note updated successfully.';

export const NOTE_DELETE_SUCCESS_MESSAGE = 'Application note deleted successfully.';

export const NOTES_DETAIL_MAX_ROWS = 100;

export const NOTE_TEXT_MAX_LEN = TEXT_FIELD_MAX_LEN;

/** Allowed status_code values for application list filters. */
export const APPLICATION_STATUS_FILTER_CODES = [
  'NEW',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW',
  'OFFER',
  'SELECTED',
  'HIRED',
  'REJECTED',
  'WITHDRAWN'
];

export const VALID_NOTE_TYPE_CODES = [
  'GENERAL',
  'INTERVIEW',
  'SCREENING',
  'OFFER',
  'REJECTION',
  'INTERNAL'
];

export const NOTE_SELECT_SQL = `
  n.NOTE_ID,
  n.NOTE_GUID,
  n.APPLICATION_ID,
  a.APPLICATION_GUID,
  a.APPLICATION_NUMBER,
  n.NOTE_TYPE_CODE,
  DBMS_LOB.SUBSTR(n.NOTE_TEXT, 4000, 1) AS NOTE_TEXT,
  n.PRIVATE_FLAG,
  n.CREATED_BY,
  n.CREATION_DATE,
  n.LAST_UPDATED_BY,
  n.LAST_UPDATE_DATE
`.trim();

export const NOTES_JOIN_SQL = `
  ${REC_APPLICATION_NOTES_TABLE} n
  INNER JOIN ${REC_APPLICATIONS_TABLE} a
    ON a.APPLICATION_ID = n.APPLICATION_ID
   AND a.ENTERPRISE_ID = n.ENTERPRISE_ID
`;
