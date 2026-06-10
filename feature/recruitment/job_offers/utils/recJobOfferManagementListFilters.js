import oracledb from 'oracledb';
import { ValidationError } from '../../../../utils/errors/index.js';
import { pruneBindsForSql, setBindValue } from '../../shared/recViewListSql.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import { VALID_OFFER_STATUS_CODES } from './recJobOfferConstants.js';
import {
  buildJobOfferSearchWhereClause,
  JOB_OFFER_SEARCH_FIELDS,
  pickJobOfferSearchTerm,
  toJobOfferSearchPattern
} from './recJobOfferSearchFilters.js';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function buildJobOfferManagementListFilters(query) {
  const enterpriseId = parseEnterpriseIdFromQuery(query);
  const parts = ['WHERE v.ENTERPRISE_ID = :p_enterprise_id'];
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 }
  };

  if (isNonEmptyTrimmed(query?.status)) {
    const status = String(query.status).trim().toUpperCase();
    if (!VALID_OFFER_STATUS_CODES.includes(status)) {
      throw new ValidationError('Validation failed', [
        `status must be one of: ${VALID_OFFER_STATUS_CODES.join(', ')}`
      ]);
    }
    parts.push(`AND (
      UPPER(v.DISPLAY_STATUS) = :p_status
      OR UPPER(v.STATUS_CODE) = :p_status
    )`);
    binds.p_status = { val: status, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 60 };
  }

  parts.push(`AND ${buildJobOfferSearchWhereClause(JOB_OFFER_SEARCH_FIELDS)}`);

  const searchPattern = toJobOfferSearchPattern(pickJobOfferSearchTerm(query));
  setBindValue(binds, 'p_search_pat', searchPattern);

  const whereSql = parts.join(' ');
  return { whereSql, binds: pruneBindsForSql(whereSql, binds), enterpriseId };
}
