/** Constants for GET /api/job-postings/:posting_guid/employer-info */

export const JOB_POSTING_EMPLOYER_INFO_VIEW =
  process.env.REC_JOB_POSTING_EMPLOYER_INFO_V || 'REC.V_JOB_POSTING_EMPLOYER_INFO';

export const MESSAGES = Object.freeze({
  OK: 'Employer information retrieved successfully.',
  NONE: 'No employer information configured for this job posting.',
  POSTING_NOT_FOUND: 'Job posting not found.',
  REQUISITION_NOT_FOUND: 'Requisition associated with the job posting was not found.',
  READ_ERROR: 'Unable to retrieve employer information for this job posting.',
  GUID_REQUIRED: 'posting_guid is required',
  GUID_INVALID: 'posting_guid must be a valid 32-character hex GUID'
});

/** @deprecated use MESSAGES — kept for any external imports */
export const EMPLOYER_INFO_OK_MESSAGE = MESSAGES.OK;
export const EMPLOYER_INFO_NONE_MESSAGE = MESSAGES.NONE;
export const POSTING_NOT_FOUND_MESSAGE = MESSAGES.POSTING_NOT_FOUND;
export const REQUISITION_NOT_FOUND_MESSAGE = MESSAGES.REQUISITION_NOT_FOUND;
export const EMPLOYER_INFO_READ_ERROR = MESSAGES.READ_ERROR;
