/** Interview lifecycle status (REC.CANDIDATE_INTERVIEWS.STATUS). */
export const INTERVIEW_STATUS_CODES = new Set([
  'SCHEDULED',
  'COMPLETED',
  'CANCELLED',
  'RESCHEDULED'
]);

/** Interview outcome (REC.CANDIDATE_INTERVIEWS.RESULT_STATUS). */
export const INTERVIEW_RESULT_STATUSES = new Set(['PENDING', 'SELECTED', 'REJECTED', 'ON_HOLD']);

/** Schedule/update interview mode. */
export const INTERVIEW_MODES = new Set(['ONSITE', 'ONLINE', 'PHONE']);

/** SUBMIT_FEEDBACK recommendation codes (maps to RESULT_STATUS in package). */
export const INTERVIEW_RECOMMENDATIONS = new Set([
  'HIRE',
  'SELECTED',
  'NO_HIRE',
  'REJECTED',
  'HOLD',
  'ON_HOLD'
]);

export const INTERVIEW_MUTATION_ERRORS = {
  schedule: 'Unable to schedule interview. Please try again.',
  update: 'Unable to update interview. Please try again.',
  delete: 'Unable to delete interview. Please try again.',
  feedback: 'Unable to submit interview feedback. Please try again.'
};

/** CLOB/JSON columns on REC.CANDIDATE_INTERVIEWS_V parsed for API responses. */
export const INTERVIEW_VIEW_JSON_ARRAY_COLUMNS = ['interviewers_json'];
export const INTERVIEW_VIEW_JSON_OBJECT_COLUMNS = ['feedback_obj'];
