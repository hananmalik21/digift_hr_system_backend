/** Standard not-found payload for candidate detail GET. */
export const CANDIDATE_NOT_FOUND_CODE = 'CANDIDATE_NOT_FOUND';
export const CANDIDATE_NOT_FOUND_MESSAGE = 'Candidate not found.';

/**
 * Slim list response fields (no child JSON collections).
 * Maps 1:1 with REC.CANDIDATES_FULL_V columns except DATE_OF_BIRTH is omitted on list.
 */
export const CANDIDATE_LIST_API_FIELDS = [
  'candidate_id',
  'candidate_guid',
  'enterprise_id',
  'first_name',
  'middle_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'current_title',
  'current_employer',
  'years_experience',
  'current_location',
  'preferred_location',
  'nationality',
  'visa_status',
  'source',
  'source_from',
  'status',
  'active_flag',
  'skills',
  'creation_date'
];

/** View columns selected for list queries (no large JSON CLOB aggregates). */
export const CANDIDATE_LIST_VIEW_COLUMNS = [
  'CANDIDATE_ID',
  'CANDIDATE_GUID',
  'ENTERPRISE_ID',
  'FIRST_NAME',
  'MIDDLE_NAME',
  'LAST_NAME',
  'FULL_NAME',
  'EMAIL',
  'PHONE',
  'CURRENT_TITLE',
  'CURRENT_EMPLOYER',
  'YEARS_EXPERIENCE',
  'CURRENT_LOCATION',
  'PREFERRED_LOCATION',
  'NATIONALITY',
  'VISA_STATUS',
  'SOURCE',
  'SOURCE_FROM',
  'STATUS',
  'ACTIVE_FLAG',
  'SKILLS_JSON',
  'CREATION_DATE'
];
