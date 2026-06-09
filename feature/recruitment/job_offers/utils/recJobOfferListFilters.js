import oracledb from 'oracledb';
import { ValidationError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import { parseHexGuidParam } from '../../shared/recValidationUtils.js';
import { VALID_OFFER_STATUS_CODES } from './recJobOfferConstants.js';

const OPTIONAL_GUID_MESSAGES = {
  candidate_guid: { invalidMessage: 'candidate_guid must be a valid 32-character hex GUID' },
  application_guid: { invalidMessage: 'application_guid must be a valid 32-character hex GUID' }
};

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {string} field
 */
function parseOptionalGuidFromQuery(query, field) {
  if (!isNonEmptyTrimmed(query?.[field])) return null;
  const messages = OPTIONAL_GUID_MESSAGES[field];
  return parseHexGuidParam(query[field], {
    requiredMessage: messages.invalidMessage,
    invalidMessage: messages.invalidMessage
  });
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function buildJobOfferListFilters(query) {
  const enterpriseId = parseEnterpriseIdFromQuery(query);
  const parts = ['WHERE v.ENTERPRISE_ID = :p_enterprise_id'];
  const binds = {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
  };

  if (isNonEmptyTrimmed(query?.status_code)) {
    const code = String(query.status_code).trim().toUpperCase();
    if (!VALID_OFFER_STATUS_CODES.includes(code)) {
      throw new ValidationError('Validation failed', [
        `status_code must be one of: ${VALID_OFFER_STATUS_CODES.join(', ')}`
      ]);
    }
    parts.push('AND v.STATUS_CODE = :p_status_code');
    binds.p_status_code = { val: code, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 30 };
  }

  const candidateGuid = parseOptionalGuidFromQuery(query, 'candidate_guid');
  if (candidateGuid) {
    parts.push('AND v.CANDIDATE_GUID = :p_candidate_guid');
    binds.p_candidate_guid = {
      val: hexToRawBuffer(candidateGuid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    };
  }

  const applicationGuid = parseOptionalGuidFromQuery(query, 'application_guid');
  if (applicationGuid) {
    parts.push('AND v.APPLICATION_GUID = :p_application_guid');
    binds.p_application_guid = {
      val: hexToRawBuffer(applicationGuid),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    };
  }

  if (isNonEmptyTrimmed(query?.posting_id)) {
    const n = Number(query.posting_id);
    if (!Number.isFinite(n) || n <= 0) {
      throw new ValidationError('Validation failed', ['posting_id must be a positive number']);
    }
    parts.push('AND v.POSTING_ID = :p_posting_id');
    binds.p_posting_id = { val: n, dir: oracledb.BIND_IN, type: oracledb.NUMBER };
  }

  return { whereSql: parts.join(' '), binds, enterpriseId };
}
