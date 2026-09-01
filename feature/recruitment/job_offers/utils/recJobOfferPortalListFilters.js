import oracledb from 'oracledb';
import { ensureHex32, normalizeHex32 } from '@digifyhr/common';
import { pruneBindsForSql } from '../../shared/recViewListSql.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import {
  throwIfValidationErrors,
  validateHexGuidInErrors
} from '../../shared/recValidationUtils.js';
import { OFFER_STATUS_EXTENDED } from './recJobOfferPortalConstants.js';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function buildJobOfferPortalListFilters(query) {
  const enterpriseId = parseEnterpriseIdFromQuery(query);
  const errors = [];
  validateHexGuidInErrors(errors, query?.candidate_guid, 'candidate_guid');
  throwIfValidationErrors(errors);

  const candidateGuid = ensureHex32(normalizeHex32(query.candidate_guid));
  const parts = [
    'WHERE v.ENTERPRISE_ID = :p_enterprise_id',
    'AND v.CANDIDATE_GUID = :p_candidate_guid',
    'AND UPPER(v.STATUS_CODE) = :p_status_code'
  ];
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: { val: candidateGuid, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 32 },
    p_status_code: {
      val: OFFER_STATUS_EXTENDED,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 60
    }
  };

  const whereSql = parts.join(' ');
  return { whereSql, binds: pruneBindsForSql(whereSql, binds), enterpriseId, candidateGuid };
}
