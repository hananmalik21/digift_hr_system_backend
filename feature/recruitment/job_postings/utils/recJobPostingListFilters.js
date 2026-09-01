import oracledb from 'oracledb';
import { hexToRawBuffer } from '@digifyhr/common';
import { escapeLikePattern } from '@digifyhr/common';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import {
  buildSearchWhereClause,
  pickSearchTerm,
  RECRUITMENT_SEARCH_FIELDS,
  toSearchLikePattern
} from './recJobPostingSearchFilters.js';
import { optionalEqClause, setBindValue } from './recJobPostingViewSql.js';
import { parseOptionalYnFilter } from './recJobPostingViewValidators.js';
import { parseRequisitionGuidFromQuery } from './recJobPostingValidators.js';

export { normalizeJobPostingListQuery } from './recJobPostingSearchFilters.js';

/**
 * @param {number} enterpriseId
 */
function createListBinds(enterpriseId) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_status_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_requisition_guid: { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    p_portal_visible_flag: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_position_name_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_employment_type_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_work_mode_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 }
  };
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ whereSql: string, binds: Record<string, unknown> }}
 */
export function buildJobPostingListFilters(query) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const binds = createListBinds(enterprise_id);
  const parts = ['v.ENTERPRISE_ID = :p_enterprise_id'];

  if (isNonEmptyTrimmed(query?.status_code)) {
    setBindValue(binds, 'p_status_code', String(query.status_code).trim().toUpperCase());
  }
  parts.push(optionalEqClause('p_status_code', 'STATUS_CODE'));

  setBindValue(binds, 'p_portal_visible_flag', parseOptionalYnFilter(
    query?.portal_visible_flag,
    'portal_visible_flag'
  ));
  parts.push(optionalEqClause('p_portal_visible_flag', 'PORTAL_VISIBLE_FLAG'));

  const requisitionHex = parseRequisitionGuidFromQuery(query);
  if (requisitionHex) {
    setBindValue(binds, 'p_requisition_guid', hexToRawBuffer(requisitionHex));
  }
  parts.push(optionalEqClause('p_requisition_guid', 'REQUISITION_GUID'));

  setBindValue(binds, 'p_search_pat', toSearchLikePattern(pickSearchTerm(query)));
  parts.push(buildSearchWhereClause(RECRUITMENT_SEARCH_FIELDS));

  parts.push(`(
    :p_position_name_pat IS NULL
    OR LOWER(v.POSITION_NAME) LIKE LOWER(:p_position_name_pat) ESCAPE '\\'
  )`);
  if (isNonEmptyTrimmed(query?.position_name)) {
    setBindValue(
      binds,
      'p_position_name_pat',
      `%${escapeLikePattern(String(query.position_name).trim())}%`
    );
  }

  if (isNonEmptyTrimmed(query?.employment_type_code)) {
    setBindValue(
      binds,
      'p_employment_type_code',
      String(query.employment_type_code).trim().toUpperCase()
    );
  }
  parts.push(optionalEqClause('p_employment_type_code', 'EMPLOYMENT_TYPE_CODE'));

  if (isNonEmptyTrimmed(query?.work_mode_code)) {
    setBindValue(binds, 'p_work_mode_code', String(query.work_mode_code).trim().toUpperCase());
  }
  parts.push(optionalEqClause('p_work_mode_code', 'WORK_MODE_CODE'));

  return { whereSql: `WHERE ${parts.join(' AND ')}`, binds };
}
