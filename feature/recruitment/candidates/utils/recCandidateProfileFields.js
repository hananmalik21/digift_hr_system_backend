/** Oracle REC.CANDIDATES link column max length. */
export const CANDIDATE_LINK_MAX_LEN = 1000;

/** Profile / compensation columns passed to REC.CANDIDATE_PKG create & update. */
export const CANDIDATE_PROFILE_PLSQL_ARGS = `
    p_current_salary      => :p_current_salary,
    p_portfolio_link      => :p_portfolio_link,
    p_github_link         => :p_github_link,
    p_willing_to_relocate => :p_willing_to_relocate`;

/**
 * Demographic / contact columns on REC.CANDIDATES (API field `dob` → P_DATE_OF_BIRTH).
 * Passed to REC.CANDIDATE_PKG create & update.
 */
export const CANDIDATE_DEMOGRAPHIC_PLSQL_ARGS = `
    p_date_of_birth       => :p_date_of_birth,
    p_gender              => :p_gender,
    p_nationality         => :p_nationality,
    p_visa_status         => :p_visa_status,
    p_alternate_phone     => :p_alternate_phone,
    p_alternate_email     => :p_alternate_email,
    p_preferred_location  => :p_preferred_location,
    p_source_from         => :p_source_from`;

/** DB / view column names for the demographic fields (list SELECT). */
export const CANDIDATE_DEMOGRAPHIC_VIEW_COLS = [
  'DATE_OF_BIRTH',
  'GENDER',
  'NATIONALITY',
  'VISA_STATUS',
  'ALTERNATE_PHONE',
  'ALTERNATE_EMAIL',
  'PREFERRED_LOCATION',
  'SOURCE_FROM'
];

/** API request/response field names (excluding `dob`, which maps from DATE_OF_BIRTH). */
export const CANDIDATE_DEMOGRAPHIC_API_FIELDS = [
  'dob',
  'gender',
  'nationality',
  'visa_status',
  'alternate_phone',
  'alternate_email',
  'preferred_location',
  'source_from'
];

/** Trim-only demographic string fields validated in validateCandidateDemographicFieldsInErrors. */
export const CANDIDATE_DEMOGRAPHIC_TRIM_FIELDS = [
  'nationality',
  'visa_status',
  'preferred_location',
  'source_from'
];

/** View column mapped to API field `dob`. */
export const CANDIDATE_DOB_VIEW_COLUMN = 'date_of_birth';

export {
  CANDIDATE_CHILD_JSON_API_FIELDS,
  CANDIDATE_EDUCATION_FIELD,
  CANDIDATE_EXPERIENCE_FIELD,
  CANDIDATE_SKILLS_FIELD
} from './recCandidateChildJsonUtils.js';
