/**
 * SQL for requisition company-info from REC.V_REQUISITION_COMPANY_INFO.
 * Hierarchy resolution is done entirely by the view.
 */

import { REQUISITION_COMPANY_INFO_VIEW } from './recRequisitionCompanyInfoConstants.js';

/** Explicit columns required by the API (no SELECT *). */
export const SELECT_COLUMNS = `
  v.REQUISITION_ID,
  v.REQUISITION_GUID,
  v.ENTERPRISE_ID,
  v.REQUISITION_NUMBER,
  v.REQUISITION_TITLE,
  v.REQUISITION_ORG_UNIT_ID,
  v.REQUISITION_ORG_LEVEL_CODE,
  v.REQUISITION_ORG_UNIT_CODE,
  v.REQUISITION_ORG_UNIT_NAME_EN,
  v.REQUISITION_ORG_UNIT_NAME_AR,
  v.COMPANY_ID,
  v.COMPANY_CODE,
  v.COMPANY_NAME_EN,
  v.COMPANY_NAME_AR,
  v.COMPANY_LEVEL_CODE,
  v.COMPANY_STATUS,
  v.COMPANY_IS_ACTIVE,
  v.LEGAL_EMPLOYER,
  v.CURRENCY_CODE,
  v.COMPANY_MANAGER_NAME,
  v.COMPANY_MANAGER_EMAIL,
  v.COMPANY_MANAGER_PHONE,
  v.COMPANY_LOCATION,
  v.COMPANY_CITY,
  v.COMPANY_ADDRESS,
  v.COMPANY_DESCRIPTION
`.trim();

/**
 * Binds: :p_requisition_guid (RAW), :p_enterprise_id (NUMBER).
 * Enterprise filter enforces tenant isolation.
 */
export const SELECT_BY_GUID_AND_ENTERPRISE = `
  SELECT ${SELECT_COLUMNS}
  FROM ${REQUISITION_COMPANY_INFO_VIEW} v
  WHERE v.REQUISITION_GUID = :p_requisition_guid
    AND v.ENTERPRISE_ID = :p_enterprise_id
  FETCH FIRST 1 ROW ONLY
`;
