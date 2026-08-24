/** Constants for GET /api/recruitment/requisitions/:requisition_guid/company-info */

export const LOG_TAG = 'recRequisitionCompanyInfo';

export const REQUISITION_COMPANY_INFO_VIEW =
  process.env.REC_REQUISITION_COMPANY_INFO_V || 'REC.V_REQUISITION_COMPANY_INFO';

export const MESSAGES = Object.freeze({
  OK: 'Requisition company information retrieved successfully.',
  NOT_FOUND: 'Requisition company information not found.',
  READ_ERROR: 'Unable to retrieve requisition company information. Please try again.',
  REQUISITION_GUID_REQUIRED: 'requisition_guid is required',
  REQUISITION_GUID_INVALID: 'requisition_guid must be a valid 32-character hex GUID'
});
