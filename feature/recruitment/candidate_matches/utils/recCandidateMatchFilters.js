import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import { optionalEqClause, setBindValue } from '../../shared/recViewListSql.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import {
  parseAvailabilityCodeFilter,
  parseAppliedStatusFilter,
  parseFindCandidatesSortSql,
  parseMatchLevelFilter,
  parseMinAvailabilityScore,
  parseMinMatchScore,
  parseOptionalUpperCode,
  parseWillingToRelocateFilter
} from './recCandidateMatchValidators.js';
import { SEARCH_COLUMNS } from './recCandidateMatchConstants.js';

/**
 * @param {number} enterpriseId
 * @param {string} requisitionGuidHex
 */
function createListBinds(enterpriseId, requisitionGuidHex) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_guid: {
      val: hexToRawBuffer(requisitionGuidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_min_match_score: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_min_availability_score: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_match_level: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_availability_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_location_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_willing_to_relocate: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_applied_flag: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_application_stage_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_application_status_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 }
  };
}

function toLikePattern(raw) {
  if (!isNonEmptyTrimmed(raw)) return null;
  return `%${escapeLikePattern(String(raw).trim())}%`;
}

function searchWhereClause() {
  const likes = SEARCH_COLUMNS.map(
    (column) => `LOWER(v.${column}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`
  );
  return `(:p_search_pat IS NULL OR ${likes.join(' OR ')})`;
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ whereSql: string, binds: Record<string, unknown>, orderSql: string }}
 */
export function buildCandidateMatchListFilters(requisitionGuidHex, enterpriseId, query) {
  const binds = createListBinds(enterpriseId, requisitionGuidHex);
  const parts = [
    'v.ENTERPRISE_ID = :p_enterprise_id',
    'v.REQUISITION_GUID = :p_requisition_guid'
  ];

  const minScore = parseMinMatchScore(query?.min_match_score ?? query?.minMatchScore);
  if (minScore != null) {
    setBindValue(binds, 'p_min_match_score', minScore);
  }
  parts.push('(:p_min_match_score IS NULL OR v.MATCH_SCORE >= :p_min_match_score)');

  const minAvailability = parseMinAvailabilityScore(
    query?.min_availability_score ?? query?.minAvailabilityScore
  );
  if (minAvailability != null) {
    setBindValue(binds, 'p_min_availability_score', minAvailability);
  }
  parts.push(
    '(:p_min_availability_score IS NULL OR v.AVAILABILITY_SCORE >= :p_min_availability_score)'
  );

  setBindValue(binds, 'p_match_level', parseMatchLevelFilter(query?.match_level ?? query?.matchLevel));
  parts.push(optionalEqClause('p_match_level', 'MATCH_LEVEL'));

  setBindValue(
    binds,
    'p_availability_code',
    parseAvailabilityCodeFilter(query?.availability_code ?? query?.availabilityCode)
  );
  parts.push(optionalEqClause('p_availability_code', 'AVAILABILITY_CODE'));

  const locationPat = toLikePattern(query?.location);
  if (locationPat) {
    setBindValue(binds, 'p_location_pat', locationPat);
  }
  parts.push(`(
    :p_location_pat IS NULL
    OR LOWER(v.CURRENT_LOCATION) LIKE LOWER(:p_location_pat) ESCAPE '\\'
    OR LOWER(v.LOCATION_DISPLAY) LIKE LOWER(:p_location_pat) ESCAPE '\\'
  )`);

  setBindValue(
    binds,
    'p_willing_to_relocate',
    parseWillingToRelocateFilter(query?.willing_to_relocate ?? query?.willingToRelocate)
  );
  parts.push(optionalEqClause('p_willing_to_relocate', 'WILLING_TO_RELOCATE'));

  const appliedFlag = parseAppliedStatusFilter(query?.applied_status ?? query?.appliedStatus);
  if (appliedFlag) {
    setBindValue(binds, 'p_applied_flag', appliedFlag);
  }
  parts.push(optionalEqClause('p_applied_flag', 'APPLIED_FLAG'));

  setBindValue(
    binds,
    'p_application_stage_code',
    parseOptionalUpperCode(query?.application_stage_code ?? query?.applicationStageCode)
  );
  parts.push(optionalEqClause('p_application_stage_code', 'APPLICATION_STAGE_CODE'));

  setBindValue(
    binds,
    'p_application_status_code',
    parseOptionalUpperCode(query?.application_status_code ?? query?.applicationStatusCode)
  );
  parts.push(optionalEqClause('p_application_status_code', 'APPLICATION_STATUS_CODE'));

  const searchPat = toLikePattern(query?.search ?? query?.q);
  if (searchPat) {
    setBindValue(binds, 'p_search_pat', searchPat);
  }
  parts.push(searchWhereClause());

  return {
    whereSql: `WHERE ${parts.join(' AND ')}`,
    binds,
    orderSql: parseFindCandidatesSortSql(query)
  };
}
