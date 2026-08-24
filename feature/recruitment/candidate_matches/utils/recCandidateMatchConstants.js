/** Oracle view for Find Candidates (source of truth for match display fields). */
export const REC_CANDIDATE_MATCH_VIEW =
  process.env.REC_REQUISITION_CANDIDATE_MATCH_V || 'REC.V_REQUISITION_CANDIDATE_MATCH';

export const REC_REQUISITION_LIST_VIEW = process.env.REC_REQUISITION_LIST_V || 'REC.V_REQUISITION_LIST';

export const LOG_TAG = 'recCandidateMatch';

export const READ_ERROR_MESSAGE = 'Unable to fetch matching candidates. Please try again.';
export const LIST_SUCCESS_MESSAGE = 'Matching candidates fetched successfully';
export const ADD_AS_APPLICANT_SUCCESS_MESSAGE = 'Candidate added as applicant successfully.';
export const ADD_AS_APPLICANT_ERROR_MESSAGE = 'Unable to add candidate as applicant.';

/** Find-candidates list 404 (view miss). */
export const REQUISITION_NOT_FOUND_MESSAGE = 'Requisition not found';

/** Oracle ADD_AS_APPLICANT_PKG business messages (keep in sync with package). */
export const ALREADY_APPLIED_MESSAGE = 'Candidate is already an applicant for this requisition.';
/** Conflict response copy for Add as Applicant (package still authoritative). */
export const ALREADY_APPLIED_CONFLICT_MESSAGE =
  'Candidate has already applied to this requisition';
export const ADD_AS_APPLICANT_REQUISITION_NOT_FOUND_MESSAGE = 'Requisition does not exist.';
export const ADD_AS_APPLICANT_CANDIDATE_NOT_FOUND_MESSAGE = 'Candidate does not exist.';
export const REQUISITION_NOT_APPROVED_MESSAGE =
  'The requisition must be approved before a candidate can be added as an applicant.';
export const REQUISITION_NOT_OPEN_MESSAGE =
  'The requisition must be open before a candidate can be added as an applicant.';
export const NO_ACTIVE_POSTING_MESSAGE =
  'An active job posting is required before a candidate can be added as an applicant.';

/**
 * Exact p_message → HTTP mapping for ADD_AS_APPLICANT.
 * @type {Readonly<Record<string, 'conflict' | 'not_found' | 'validation'>>}
 */
export const ADD_AS_APPLICANT_PACKAGE_ERROR_KINDS = Object.freeze({
  [ALREADY_APPLIED_MESSAGE]: 'conflict',
  [ALREADY_APPLIED_CONFLICT_MESSAGE]: 'conflict',
  [ADD_AS_APPLICANT_REQUISITION_NOT_FOUND_MESSAGE]: 'not_found',
  [ADD_AS_APPLICANT_CANDIDATE_NOT_FOUND_MESSAGE]: 'not_found',
  [REQUISITION_NOT_APPROVED_MESSAGE]: 'validation',
  [REQUISITION_NOT_OPEN_MESSAGE]: 'validation',
  [NO_ACTIVE_POSTING_MESSAGE]: 'validation'
});

/** Fixed application source for Find Candidates → Add as Applicant (never from client). */
export const ADD_AS_APPLICANT_SOURCE_CODE = 'HR_SYSTEM';
export const ADD_AS_APPLICANT_STAGE_CODE = 'APPLIED';
export const ADD_AS_APPLICANT_STATUS_CODE = 'NEW';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const DEFAULT_SORT_BY = 'match_score';

export const LOCATION_UNSPECIFIED_DISPLAY = 'Not specified';

export const SORT_COLUMNS = Object.freeze({
  match_score: 'v.MATCH_SCORE',
  years_experience: 'v.YEARS_EXPERIENCE',
  availability_score: 'v.AVAILABILITY_SCORE',
  candidate_name: 'v.CANDIDATE_NAME'
});

export const SORT_KEYS = Object.freeze(Object.keys(SORT_COLUMNS));

export const FIND_CANDIDATES_TIEBREAKER_SQL =
  'v.TITLE_MATCH_SCORE DESC NULLS LAST, v.YEARS_EXPERIENCE DESC NULLS LAST, v.CANDIDATE_ID DESC';

export const SEARCH_COLUMNS = Object.freeze([
  'CANDIDATE_NAME',
  'CURRENT_TITLE',
  'CURRENT_EMPLOYER',
  'EMAIL',
  'CURRENT_LOCATION'
]);

/** Find-candidates applied_status filter values. */
export const APPLIED_STATUS_FILTERS = Object.freeze(['ALL', 'APPLIED', 'NOT_APPLIED']);
