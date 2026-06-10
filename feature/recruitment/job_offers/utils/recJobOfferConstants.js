export const MUTATION_ERROR_MESSAGE = 'Unable to process job offer. Please try again.';
export const READ_ERROR_MESSAGE = 'Unable to fetch job offers. Please try again.';
export const LIST_SUCCESS_MESSAGE = 'Job offers fetched successfully';
export const DETAIL_SUCCESS_MESSAGE = 'Job offer details fetched successfully';
export const NOT_FOUND_MESSAGE = 'Offer not found.';

export const CREATE_SUCCESS_MESSAGE = 'Offer created successfully.';

export const OFFER_STAGE_DRAFT = 'Draft Offer';
export const OFFER_STATUS_DRAFT = 'DRAFT';
export const OFFER_STAGE_DESCRIPTION_DRAFT = 'Offer is being prepared and awaiting review.';

export const VALID_OFFER_STATUS_CODES = [
  'DRAFT',
  'APPROVED',
  'REJECTED',
  'EXTENDED',
  'ACCEPTED',
  'DECLINED',
  'EXPIRED',
  'WITHDRAWN'
];

/** Oracle view for offer management list reads. */
export const REC_JOB_OFFER_MANAGEMENT_VIEW =
  process.env.REC_JOB_OFFER_MANAGEMENT_V || 'REC.V_JOB_OFFER_MANAGEMENT';

export const LOG_TAG = 'recJobOfferViewModel';

export const JOB_OFFER_MANAGEMENT_LIST_ORDER_SQL =
  'ORDER BY v.CREATION_DATE DESC NULLS LAST, v.OFFER_ID DESC';

/** GUID fields to normalize inside nested JSON objects from the management view. */
export const JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS = {
  candidate_obj: ['candidate_guid'],
  posting_obj: ['posting_guid'],
  position_obj: ['position_id', 'position_guid'],
  department_obj: ['department_id', 'department_guid']
};

/** Columns from REC.V_JOB_OFFER_MANAGEMENT (keep in sync with mapper). */
export const JOB_OFFER_MANAGEMENT_SELECT_COLUMNS = [
  'OFFER_ID',
  'OFFER_GUID',
  'ENTERPRISE_ID',
  'APPLICATION_ID',
  'CANDIDATE_GUID',
  'POSTING_ID',
  'OFFER_NUMBER',
  'POSTING_GUID',
  'POSTING_TITLE',
  'JOB_TITLE',
  'LOCATION',
  'WORK_MODE_CODE',
  'EMPLOYMENT_TYPE_CODE',
  'START_DATE',
  'OFFER_DATE',
  'EXPIRY_DATE',
  'STATUS_CODE',
  'APPROVAL_STATUS',
  'DISPLAY_STATUS',
  'STAGE',
  'STAGE_DESCRIPTION',
  'ANNUAL_SALARY',
  'CANDIDATE_OBJ',
  'POSTING_OBJ',
  'POSITION_OBJ',
  'DEPARTMENT_OBJ',
  'GRADE_OBJ',
  'COMPONENTS_JSON',
  'BENEFITS_JSON',
  'TERMS_JSON',
  'COMMENTS',
  'DECLINE_COMMENTS',
  'CREATED_BY',
  'CREATION_DATE',
  'LAST_UPDATED_BY',
  'LAST_UPDATE_DATE'
];

export const JOB_OFFER_MANAGEMENT_SELECT_SQL = JOB_OFFER_MANAGEMENT_SELECT_COLUMNS.map(
  (c) => `v.${c}`
).join(', ');
