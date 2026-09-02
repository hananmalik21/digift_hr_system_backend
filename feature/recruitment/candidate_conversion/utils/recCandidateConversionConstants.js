/** REC.CANDIDATE_TO_EMPLOYEE_PKG — employee + assignment conversion and Transfer to HR. */
export const PKG = 'REC.CANDIDATE_TO_EMPLOYEE_PKG';
export const VALIDATE_PROC = `${PKG}.VALIDATE_CONVERSION`;
export const CONVERT_PROC = `${PKG}.CONVERT_TO_EMPLOYEE`;
export const TRANSFER_PROC = `${PKG}.TRANSFER_TO_HR`;
export const UPDATE_TRANSFER_ACTION_PROC = `${PKG}.UPDATE_TRANSFER_ACTION_STATUS`;

export const LOG_TAG = 'recCandidateConversion';
export const TRANSFER_LOG_TAG = 'recCandidateTransfer';

export const VALIDATE_SUCCESS_MESSAGE = 'Candidate is eligible for employee conversion.';
export const CONVERT_SUCCESS_MESSAGE = 'Candidate converted to employee successfully.';
export const TRANSFER_SUCCESS_MESSAGE = 'Candidate transferred to HR successfully.';
export const TRANSFER_SUCCESS_NOTIFICATION_FAILED_MESSAGE =
  'Candidate transferred to HR successfully, but notification could not be sent.';
export const TRANSFER_SUCCESS_ONBOARDING_FAILED_MESSAGE =
  'Candidate transferred to HR successfully, but onboarding could not be triggered.';
export const TRANSFER_SUCCESS_BOTH_SIDE_EFFECTS_FAILED_MESSAGE =
  'Candidate transferred to HR successfully, but notification could not be sent and onboarding could not be triggered.';
export const GENERIC_ERROR_MESSAGE = 'Unable to convert candidate to employee. Please try again.';
export const GENERIC_TRANSFER_ERROR_MESSAGE =
  'Unable to transfer candidate to HR. Please try again.';
export const INVALID_OFFER_GUID_MESSAGE =
  'offer_guid must be a 32-character hexadecimal string.';
export const INVALID_CANDIDATE_GUID_MESSAGE =
  'candidate_guid must be a 32-character hexadecimal string.';
export const INVALID_PROBATION_DAYS_MESSAGE = 'Probation days must be zero or greater.';
export const ACCEPTED_OFFER_NOT_FOUND_MESSAGE = 'No accepted offer was found for this candidate.';
export const CANDIDATE_NOT_FOUND_MESSAGE = 'Candidate not found.';
export const HR_CONTACT_REQUIRED_MESSAGE =
  'HR department contact is required when notification is requested.';
export const INVALID_TRANSFER_NOTES_MESSAGE = 'Transfer notes must be 4000 characters or fewer.';
export const INVALID_BOOLEAN_MESSAGE = 'Value must be true or false.';
export const EMPLOYEE_CREATED_IN_HR_NOTE =
  'Employee and initial assignment will be created in HR.';

export const CONVERSION_STATUS_COMPLETED = 'COMPLETED';
export const TRANSFER_STATUS_COMPLETED = 'COMPLETED';
export const NEXT_ACTION_COMPLETE_ONBOARDING = 'COMPLETE_EMPLOYEE_ONBOARDING';
export const DEFAULT_PROBATION_DAYS = 0;
export const DEFAULT_SEND_NOTIFICATION = true;
export const DEFAULT_TRIGGER_ONBOARDING = true;
export const ACCEPTED_OFFER_STATUS = 'ACCEPTED';
export const TRANSFER_NOTES_MAX_LENGTH = 4000;
export const HR_CONTACT_ID_MAX_LENGTH = 200;
export const NOTIFICATION_STATUS_SENT = 'SENT';
export const NOTIFICATION_STATUS_FAILED = 'FAILED';
export const ONBOARDING_STATUS_TRIGGERED = 'TRIGGERED';
export const ONBOARDING_STATUS_FAILED = 'FAILED';

/** FNDSEC function codes (enforced when REC_ENFORCE_PERMISSIONS=true). */
export const REC_CANDIDATE_CONVERT_EMPLOYEE = 'REC_CANDIDATE_CONVERT_EMPLOYEE';
export const REC_CANDIDATE_TRANSFER_TO_HR = 'REC_CANDIDATE_TRANSFER_TO_HR';

export const ERROR_CODES = Object.freeze({
  INVALID_OFFER_GUID: 'INVALID_OFFER_GUID',
  INVALID_CANDIDATE_GUID: 'INVALID_CANDIDATE_GUID',
  INVALID_PROBATION_DAYS: 'INVALID_PROBATION_DAYS',
  HR_CONTACT_REQUIRED: 'HR_CONTACT_REQUIRED',
  OFFER_NOT_FOUND: 'OFFER_NOT_FOUND',
  CANDIDATE_NOT_FOUND: 'CANDIDATE_NOT_FOUND',
  ACCEPTED_OFFER_NOT_FOUND: 'ACCEPTED_OFFER_NOT_FOUND',
  OFFER_NOT_ACCEPTED: 'OFFER_NOT_ACCEPTED',
  CANDIDATE_ALREADY_CONVERTED: 'CANDIDATE_ALREADY_CONVERTED',
  OFFER_ALREADY_CONVERTED: 'OFFER_ALREADY_CONVERTED',
  OFFER_ALREADY_TRANSFERRED: 'OFFER_ALREADY_TRANSFERRED',
  EMPLOYEE_ALREADY_EXISTS: 'EMPLOYEE_ALREADY_EXISTS',
  INVALID_DEPARTMENT: 'INVALID_DEPARTMENT',
  INVALID_POSITION: 'INVALID_POSITION',
  JOB_FAMILY_NOT_CONFIGURED: 'JOB_FAMILY_NOT_CONFIGURED',
  JOB_LEVEL_NOT_CONFIGURED: 'JOB_LEVEL_NOT_CONFIGURED',
  GRADE_NOT_CONFIGURED: 'GRADE_NOT_CONFIGURED',
  INVALID_REPORTING_MANAGER: 'INVALID_REPORTING_MANAGER',
  ASSIGNMENT_CREATION_FAILED: 'ASSIGNMENT_CREATION_FAILED',
  CANDIDATE_CONVERSION_FAILED: 'CANDIDATE_CONVERSION_FAILED',
  TRANSFER_FAILED: 'TRANSFER_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED'
});
