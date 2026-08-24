/** Oracle view for Find Candidates (source of truth for match display fields). */
export const REC_CANDIDATE_MATCH_VIEW =
  process.env.REC_REQUISITION_CANDIDATE_MATCH_V || 'REC.V_REQUISITION_CANDIDATE_MATCH';

export const REC_APPLICATIONS_VIEW = process.env.REC_APPLICATIONS_V || 'REC.V_APPLICATIONS';
export const REC_JOB_POSTINGS_VIEW = process.env.REC_JOB_POSTINGS_V || 'REC.V_JOB_POSTINGS';
export const REC_REQUISITION_LIST_VIEW = process.env.REC_REQUISITION_LIST_V || 'REC.V_REQUISITION_LIST';
export const REC_CANDIDATES_FULL_VIEW = process.env.REC_CANDIDATES_FULL_V || 'REC.CANDIDATES_FULL_V';

export const LOG_TAG = 'recCandidateMatch';

export const READ_ERROR_MESSAGE = 'Unable to fetch matching candidates. Please try again.';
export const LIST_SUCCESS_MESSAGE = 'Matching candidates fetched successfully';
export const ADD_AS_APPLICANT_SUCCESS_MESSAGE = 'Candidate added as applicant successfully';
export const ADD_AS_APPLICANT_ERROR_MESSAGE =
  'Unable to add candidate as applicant. Please try again.';

export const REQUISITION_NOT_FOUND_MESSAGE = 'Requisition not found';
export const CANDIDATE_NOT_FOUND_MESSAGE = 'Candidate not found';
export const ALREADY_APPLIED_MESSAGE = 'Candidate has already applied for this requisition.';
export const POSTING_REQUIRED_MESSAGE =
  'A job posting is required to add this candidate as an applicant.';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_SORT_BY = 'match_score';
export const DEFAULT_SORT_ORDER = 'desc';

export const DEFAULT_ADD_SOURCE_CODE = 'RECRUITER';

/** Withdrawn applications do not block re-adding a candidate. */
export const INACTIVE_APPLICATION_STATUS_CODES = Object.freeze(['WITHDRAWN']);

export const LOCATION_UNSPECIFIED_DISPLAY = 'Not specified';

export const SORT_COLUMNS = Object.freeze({
  match_score: 'v.MATCH_SCORE',
  years_experience: 'v.YEARS_EXPERIENCE',
  availability_score: 'v.AVAILABILITY_SCORE',
  candidate_name: 'v.CANDIDATE_NAME'
});

export const SORT_KEYS = Object.freeze(Object.keys(SORT_COLUMNS));

export const SEARCH_COLUMNS = Object.freeze([
  'CANDIDATE_NAME',
  'CURRENT_TITLE',
  'CURRENT_EMPLOYER',
  'EMAIL',
  'CURRENT_LOCATION'
]);

/** Documented UI columns from REC.V_REQUISITION_CANDIDATE_MATCH (mapped 1:1 in the API). */
export const MATCH_VIEW_UI_COLUMNS = Object.freeze([
  'NOTICE_PERIOD',
  'NOTICE_PERIOD_DAYS',
  'ESTIMATED_AVAILABLE_DATE',
  'AVAILABILITY_SCORE',
  'AVAILABILITY_CODE',
  'AVAILABILITY_TEXT',
  'MATCH_SCORE',
  'MATCH_DISPLAY',
  'MATCH_LEVEL',
  'RECOMMENDATION_CODE',
  'CANDIDATE_SUBTITLE',
  'EXPERIENCE_DISPLAY',
  'LOCATION_DISPLAY'
]);
