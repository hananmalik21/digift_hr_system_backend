/** Optional persist table. GET scores live; POST skips persist if this object is missing. */
export const REC_APPLICATION_MATCHES_TABLE =
  process.env.REC_APPLICATION_MATCHES_TABLE || 'REC.REC_APPLICATION_MATCHES';

export const REC_APPLICATIONS_VIEW = process.env.REC_APPLICATIONS_V || 'REC.V_APPLICATIONS';
export const REC_CANDIDATES_FULL_VIEW = process.env.REC_CANDIDATES_FULL_V || 'REC.CANDIDATES_FULL_V';
export const REC_REQUISITION_LIST_VIEW = process.env.REC_REQUISITION_LIST_V || 'REC.V_REQUISITION_LIST';
export const REC_LOOKUP_VALUES_TABLE = process.env.REC_LOOKUP_VALUES_TABLE || 'REC.REC_LOOKUP_VALUES';
export const FNDSEC_WORK_LOCATIONS_VIEW =
  process.env.FNDSEC_WORK_LOCATIONS_V || 'FNDSEC.FNDSEC_WORK_LOCATIONS_V';

export const LOG_TAG = 'recApplicationMatch';

export const READ_ERROR_MESSAGE = 'Unable to fetch application matches. Please try again.';
export const DETAIL_READ_ERROR_MESSAGE = 'Unable to fetch application match. Please try again.';
export const SUMMARY_READ_ERROR_MESSAGE =
  'Unable to fetch application match summary. Please try again.';
export const RECALCULATE_ERROR_MESSAGE = 'Unable to recalculate application match. Please try again.';
export const BATCH_RECALCULATE_ERROR_MESSAGE =
  'Unable to recalculate application matches. Please try again.';

export const LIST_SUCCESS_MESSAGE = 'Application matches fetched successfully';
export const RECALCULATE_SUCCESS_MESSAGE = 'Application match recalculated successfully';
export const BATCH_RECALCULATE_SUCCESS_MESSAGE = 'Application matches recalculated successfully';
export const SUMMARY_SUCCESS_MESSAGE = 'Application match summary fetched successfully';

export const REQUISITION_NOT_FOUND_MESSAGE = 'Requisition does not exist.';
export const APPLICATION_NOT_FOUND_MESSAGE = 'Application does not exist.';

/** Active applications for bulk recalculate (exclude withdrawn). */
export const INACTIVE_APPLICATION_STATUS_CODES = ['WITHDRAWN'];

export const MATCH_WEIGHTS = Object.freeze({
  SKILLS: 30,
  EXPERIENCE: 20,
  QUALIFICATION: 15,
  TITLE: 10,
  JOB_FAMILY_LEVEL: 10,
  SCREENING: 5,
  AVAILABILITY: 4,
  LOCATION: 3,
  COMPENSATION: 3
});

export const SKILLS_REQUIRED_WEIGHT = 0.7;
export const SKILLS_PREFERRED_WEIGHT = 0.3;

/** Job family / job level split of the 10-point component, expressed as 0–100 subscores. */
export const JOB_FAMILY_SUBWEIGHT = 0.6;
export const JOB_LEVEL_SUBWEIGHT = 0.4;

export const MATCH_LEVELS = Object.freeze({
  EXCEPTIONAL: 'EXCEPTIONAL',
  STRONG: 'STRONG',
  GOOD: 'GOOD',
  PARTIAL: 'PARTIAL',
  WEAK: 'WEAK',
  POOR: 'POOR'
});

export const MATCH_LEVEL_CODES = Object.freeze(Object.values(MATCH_LEVELS));

export const RECOMMENDATIONS = Object.freeze({
  PRIORITY_SHORTLIST: 'PRIORITY_SHORTLIST',
  SHORTLIST: 'SHORTLIST',
  RECRUITER_REVIEW: 'RECRUITER_REVIEW',
  REVIEW: 'REVIEW',
  LOW_PRIORITY: 'LOW_PRIORITY'
});

export const ELIGIBILITY_STATUS = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  MANDATORY_REQUIREMENT_FAILED: 'MANDATORY_REQUIREMENT_FAILED',
  KNOCKOUT_FAILED: 'KNOCKOUT_FAILED',
  INSUFFICIENT_DATA: 'INSUFFICIENT_DATA'
});

export const ELIGIBILITY_STATUS_CODES = Object.freeze(Object.values(ELIGIBILITY_STATUS));

export const EXPERIENCE_STATUS = Object.freeze({
  MEETS_REQUIREMENT: 'MEETS_REQUIREMENT',
  EXCEEDS_REQUIREMENT: 'EXCEEDS_REQUIREMENT',
  SLIGHTLY_BELOW: 'SLIGHTLY_BELOW',
  BELOW_REQUIREMENT: 'BELOW_REQUIREMENT',
  NO_EXPERIENCE: 'NO_EXPERIENCE',
  UNKNOWN: 'UNKNOWN'
});

export const COMPENSATION_STATUS = Object.freeze({
  WITHIN_RANGE: 'WITHIN_RANGE',
  BELOW_RANGE: 'BELOW_RANGE',
  SLIGHTLY_ABOVE: 'SLIGHTLY_ABOVE',
  ABOVE_RANGE: 'ABOVE_RANGE',
  UNKNOWN: 'UNKNOWN',
  NOT_COMPARABLE: 'NOT_COMPARABLE'
});

export const COMPENSATION_SLIGHTLY_ABOVE_PCT = 0.15;

/** Neutral score when a component cannot be evaluated. Not a confirmed mismatch. */
export const UNKNOWN_COMPONENT_SCORE = 50;

/** Availability codes aligned with REC.V_REQUISITION_CANDIDATE_MATCH. */
export const AVAILABILITY_CODES = Object.freeze({
  IMMEDIATE: 'IMMEDIATE',
  WITHIN_2_WEEKS: 'WITHIN_2_WEEKS',
  WITHIN_1_MONTH: 'WITHIN_1_MONTH',
  WITHIN_2_MONTHS: 'WITHIN_2_MONTHS',
  WITHIN_3_MONTHS: 'WITHIN_3_MONTHS',
  MORE_THAN_3_MONTHS: 'MORE_THAN_3_MONTHS',
  UNKNOWN: 'UNKNOWN'
});

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Chunk size for bulk recalculate (keeps bind lists and round-trips bounded). */
export const RECALCULATE_CHUNK_SIZE = 25;

export const EXPERIENCE_LOOKUP_TYPES = Object.freeze([
  'EXPERIENCE_REQUIRED',
  'EXPERIENCE_LEVEL',
  'MIN_EXPERIENCE',
  'EXPERIENCE_REQUIRED_CODE'
]);

export const EDUCATION_LOOKUP_TYPES = Object.freeze([
  'MIN_EDUCATION_LEVEL',
  'EDUCATION_LEVEL',
  'MIN_EDUCATION_LEVEL_CODE'
]);

/**
 * Fallback experience bands when REC lookup meaning cannot be parsed.
 * Includes DigifyHR candidate-filter codes and the spec's role-level codes.
 */
export const EXPERIENCE_BAND_FALLBACKS = Object.freeze({
  ENTRY_0_2: { min: 0, max: 2, label: '0–2 years' },
  EXP_0_2: { min: 0, max: 2, label: '0–2 years' },
  '0_2': { min: 0, max: 2, label: '0–2 years' },
  MID_3_5: { min: 3, max: 5, label: '3–5 years' },
  EXP_3_5: { min: 3, max: 5, label: '3–5 years' },
  '3_5': { min: 3, max: 5, label: '3–5 years' },
  SENIOR_5_8: { min: 5, max: 8, label: '5–8 years' },
  EXP_6_10: { min: 6, max: 10, label: '6–10 years' },
  '6_10': { min: 6, max: 10, label: '6–10 years' },
  LEAD_8_PLUS: { min: 8, max: null, label: '8+ years' },
  EXP_10_PLUS: { min: 10, max: null, label: '10+ years' },
  '10_PLUS': { min: 10, max: null, label: '10+ years' }
});

export const EDUCATION_RANK_FALLBACKS = Object.freeze({
  HIGH_SCHOOL: 1,
  SECONDARY: 1,
  MATRIC: 1,
  DIPLOMA: 2,
  ASSOCIATE: 2,
  CERTIFICATE: 2,
  HND: 2,
  BACHELOR: 3,
  BACHELORS: 3,
  UNDERGRADUATE: 3,
  BA: 3,
  BS: 3,
  BSC: 3,
  BENG: 3,
  MASTER: 4,
  MASTERS: 4,
  POSTGRADUATE: 4,
  MBA: 4,
  MS: 4,
  MSC: 4,
  MA: 4,
  MENG: 4,
  DOCTORATE: 5,
  DOCTORAL: 5,
  PHD: 5,
  DPHIL: 5
});

export const LIVE_SORT_KEYS = Object.freeze([
  'match_score',
  'applied_date',
  'application_date',
  'candidate_name',
  'years_experience',
  'application_stage',
  'eligibility_status',
  'match_level'
]);
