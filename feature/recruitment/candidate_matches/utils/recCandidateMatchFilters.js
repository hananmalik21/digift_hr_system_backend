import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import { setBindValue } from '../../shared/recViewListSql.js';
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
    }
  };
}

function nullNumberBind() {
  return { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
}

function nullStringBind(maxSize) {
  return { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize };
}

function toLikePattern(raw) {
  if (!isNonEmptyTrimmed(raw)) return null;
  return `%${escapeLikePattern(String(raw).trim())}%`;
}

function searchWhereClause() {
  const likes = SEARCH_COLUMNS.map(
    (column) => `LOWER(v.${column}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`
  );
  return `(${likes.join(' OR ')})`;
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
    binds.p_min_match_score = nullNumberBind();
    setBindValue(binds, 'p_min_match_score', minScore);
    parts.push('v.MATCH_SCORE >= :p_min_match_score');
  }

  const minAvailability = parseMinAvailabilityScore(
    query?.min_availability_score ?? query?.minAvailabilityScore
  );
  if (minAvailability != null) {
    binds.p_min_availability_score = nullNumberBind();
    setBindValue(binds, 'p_min_availability_score', minAvailability);
    parts.push('v.AVAILABILITY_SCORE >= :p_min_availability_score');
  }

  const matchLevel = parseMatchLevelFilter(query?.match_level ?? query?.matchLevel);
  if (matchLevel) {
    binds.p_match_level = nullStringBind(50);
    setBindValue(binds, 'p_match_level', matchLevel);
    parts.push('v.MATCH_LEVEL = :p_match_level');
  }

  const availabilityCode = parseAvailabilityCodeFilter(
    query?.availability_code ?? query?.availabilityCode
  );
  if (availabilityCode) {
    binds.p_availability_code = nullStringBind(50);
    setBindValue(binds, 'p_availability_code', availabilityCode);
    parts.push('v.AVAILABILITY_CODE = :p_availability_code');
  }

  const locationPat = toLikePattern(query?.location);
  if (locationPat) {
    binds.p_location_pat = nullStringBind(500);
    setBindValue(binds, 'p_location_pat', locationPat);
    parts.push(`(
      LOWER(v.CURRENT_LOCATION) LIKE LOWER(:p_location_pat) ESCAPE '\\'
      OR LOWER(v.LOCATION_DISPLAY) LIKE LOWER(:p_location_pat) ESCAPE '\\'
    )`);
  }

  const willing = parseWillingToRelocateFilter(
    query?.willing_to_relocate ?? query?.willingToRelocate
  );
  if (willing) {
    binds.p_willing_to_relocate = nullStringBind(1);
    setBindValue(binds, 'p_willing_to_relocate', willing);
    parts.push('v.WILLING_TO_RELOCATE = :p_willing_to_relocate');
  }

  const appliedFlag = parseAppliedStatusFilter(query?.applied_status ?? query?.appliedStatus);
  if (appliedFlag) {
    binds.p_applied_flag = nullStringBind(1);
    setBindValue(binds, 'p_applied_flag', appliedFlag);
    parts.push('v.APPLIED_FLAG = :p_applied_flag');
  }

  const stageCode = parseOptionalUpperCode(
    query?.application_stage_code ?? query?.applicationStageCode
  );
  if (stageCode) {
    binds.p_application_stage_code = nullStringBind(50);
    setBindValue(binds, 'p_application_stage_code', stageCode);
    parts.push('v.APPLICATION_STAGE_CODE = :p_application_stage_code');
  }

  const statusCode = parseOptionalUpperCode(
    query?.application_status_code ?? query?.applicationStatusCode
  );
  if (statusCode) {
    binds.p_application_status_code = nullStringBind(50);
    setBindValue(binds, 'p_application_status_code', statusCode);
    parts.push('v.APPLICATION_STATUS_CODE = :p_application_status_code');
  }

  const searchPat = toLikePattern(query?.search ?? query?.q);
  if (searchPat) {
    binds.p_search_pat = nullStringBind(4000);
    setBindValue(binds, 'p_search_pat', searchPat);
    parts.push(searchWhereClause());
  }

  return {
    whereSql: `WHERE ${parts.join(' AND ')}`,
    binds,
    orderSql: parseFindCandidatesSortSql(query)
  };
}
