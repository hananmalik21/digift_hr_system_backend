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

/** Oracle view for job offer list reads. */
export const REC_JOB_OFFERS_VIEW = process.env.REC_JOB_OFFERS_V || 'REC.V_JOB_OFFERS';

export const LOG_TAG = 'recJobOfferViewModel';

/** Columns from REC.V_JOB_OFFERS (keep in sync with mapper). */
export const JOB_OFFER_LIST_SELECT_SQL = `
  v.OFFER_GUID,
  v.OFFER_NUMBER,
  v.STAGE,
  v.STATUS_CODE,
  v.STAGE_DESCRIPTION,
  v.APPLICATION_GUID,
  v.APPLICATION_NUMBER,
  v.CANDIDATE_GUID,
  v.CANDIDATE_NAME,
  v.POSTING_ID,
  v.JOB_TITLE,
  v.POSITION_NAME,
  v.DEPARTMENT_NAME,
  v.LOCATION,
  v.START_DATE,
  v.OFFER_DATE,
  v.EXPIRY_DATE,
  v.ENTERPRISE_ID
`.trim();
