import { parseViewOrderSql } from '../../shared/recViewSortUtils.js';
import { parseEnterpriseIdFromQuery, parseListPagination } from '../../shared/recViewQueryValidators.js';
import { parseApplicationGuidParam } from './recApplicationValidators.js';

export { parseEnterpriseIdFromQuery, parseListPagination };

const APPLICATION_SORT_COLUMNS = {
  applied_date: 'v.APPLIED_DATE',
  application_number: 'v.APPLICATION_NUMBER',
  application_id: 'v.APPLICATION_ID',
  candidate_name: 'v.CANDIDATE_NAME',
  first_name: 'v.FIRST_NAME',
  last_name: 'v.LAST_NAME',
  email: 'v.EMAIL',
  posting_title: 'v.POSTING_TITLE',
  requisition_number: 'v.REQUISITION_NUMBER',
  requisition_title: 'v.REQUISITION_TITLE',
  status_code: 'v.STATUS_CODE',
  current_stage_code: 'v.CURRENT_STAGE_CODE',
  source_code: 'v.SOURCE_CODE',
  creation_date: 'v.CREATION_DATE',
  rejection_reason_code: 'v.REJECTION_REASON_CODE'
};

const STAGE_HISTORY_SORT_COLUMNS = {
  creation_date: 'v.CREATION_DATE',
  from_stage_code: 'v.FROM_STAGE_CODE',
  to_stage_code: 'v.TO_STAGE_CODE',
  from_status_code: 'v.FROM_STATUS_CODE',
  to_status_code: 'v.TO_STATUS_CODE',
  stage_history_id: 'v.STAGE_HISTORY_ID'
};

/** @param {Record<string, unknown>|undefined} query */
export function parseApplicationSort(query) {
  return parseViewOrderSql(query, APPLICATION_SORT_COLUMNS, 'applied_date', 'v.APPLICATION_ID DESC');
}

/** @param {Record<string, unknown>|undefined} query */
export function parseStageHistorySort(query) {
  return parseViewOrderSql(
    query,
    STAGE_HISTORY_SORT_COLUMNS,
    'creation_date',
    'v.STAGE_HISTORY_ID DESC'
  );
}

/** @param {unknown} applicationGuidParam @param {unknown} enterpriseIdQuery */
export function validateApplicationGuidEnterpriseParams(applicationGuidParam, enterpriseIdQuery) {
  const application_guid = parseApplicationGuidParam(applicationGuidParam);
  const enterprise_id = parseEnterpriseIdFromQuery({ enterprise_id: enterpriseIdQuery });
  return { application_guid, enterprise_id };
}
