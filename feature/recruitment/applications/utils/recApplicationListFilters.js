import oracledb from 'oracledb';
import { ValidationError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '@digifyhr/common';
import { escapeLikePattern } from '@digifyhr/common';
import {
  optionalCsvInClause,
  optionalEqClause,
  optionalLikeClause,
  parseQueryCodeFilter,
  pruneBindsForSql,
  setBindValue
} from '../../shared/recViewListSql.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import { parseHexGuidParam } from '../../shared/recValidationUtils.js';
import {
  APPLICATION_STATUS_FILTER_CODES,
  VALID_REJECTION_REASON_CODES,
  VALID_STAGE_CODES
} from './recApplicationConstants.js';
import {
  APPLICATION_SEARCH_FIELDS,
  normalizeApplicationListQuery,
  pickApplicationSearchTerm,
  toApplicationSearchPattern
} from './recApplicationSearchFilters.js';

export { normalizeApplicationListQuery };

const OPTIONAL_GUID_MESSAGES = {
  posting_guid: { invalidMessage: 'posting_guid must be a valid 32-character hex GUID' },
  requisition_guid: { invalidMessage: 'requisition_guid must be a valid 32-character hex GUID' },
  candidate_guid: { invalidMessage: 'candidate_guid must be a valid 32-character hex GUID' }
};

/**
 * @param {number} enterpriseId
 */
function createListBinds(enterpriseId) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_application_id: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_posting_id: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_requisition_id: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_id: { val: null, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_application_number_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_candidate_name_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_email_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 320 },
    p_posting_title_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_requisition_number_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 100 },
    p_posting_guid: { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    p_requisition_guid: { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    p_candidate_guid: { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    p_status_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_status_codes_csv: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_current_stage_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_stage_codes_csv: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 500 },
    p_source_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_applied_date_from: { val: null, dir: oracledb.BIND_IN, type: oracledb.DATE },
    p_applied_date_to: { val: null, dir: oracledb.BIND_IN, type: oracledb.DATE },
    p_rejection_reason_code: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 }
  };
}

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
 * @param {unknown} raw
 * @param {string} label
 * @returns {Date|null}
 */
function parseOptionalDate(raw, label) {
  if (!isNonEmptyTrimmed(raw)) return null;
  const d = new Date(String(raw).trim());
  if (!Number.isFinite(d.getTime())) {
    throw new ValidationError('Validation failed', [`${label} must be a valid date (YYYY-MM-DD)`]);
  }
  return d;
}

function buildSearchWhereClause() {
  const clauses = APPLICATION_SEARCH_FIELDS.map((f) => {
    if (f.clob) {
      return `(
        v.${f.column} IS NOT NULL
        AND LOWER(CAST(v.${f.column} AS VARCHAR2(4000))) LIKE LOWER(:p_search_pat) ESCAPE '\\'
      )`;
    }
    return `LOWER(v.${f.column}) LIKE LOWER(:p_search_pat) ESCAPE '\\'`;
  });
  return `(:p_search_pat IS NULL OR ${clauses.join(' OR ')})`;
}

/**
 * @param {Record<string, { val: unknown }>} binds
 * @param {string[]} parts
 * @param {Record<string, unknown>|undefined} q
 * @param {string} bindKey
 * @param {string} column
 * @param {string} queryKey
 */
function appendOptionalPositiveIdFilter(binds, parts, q, bindKey, column, queryKey) {
  if (isNonEmptyTrimmed(q?.[queryKey])) {
    const n = Number(q[queryKey]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new ValidationError('Validation failed', [`${queryKey} must be a positive number`]);
    }
    setBindValue(binds, bindKey, n);
  }
  parts.push(optionalEqClause(bindKey, column));
}

/**
 * @param {Record<string, { val: unknown }>} binds
 * @param {string[]} parts
 * @param {unknown} raw
 * @param {string[]} allowed
 * @param {string} fieldLabel
 * @param {string} singleBindKey
 * @param {string} csvBindKey
 * @param {string} column
 */
function appendCodeFilter(binds, parts, raw, allowed, fieldLabel, singleBindKey, csvBindKey, column) {
  const csv = parseQueryCodeFilter(raw, allowed, fieldLabel);
  if (csv?.includes(',')) {
    setBindValue(binds, csvBindKey, csv);
    parts.push(optionalCsvInClause(csvBindKey, column));
  } else {
    if (csv) setBindValue(binds, singleBindKey, csv);
    parts.push(optionalEqClause(singleBindKey, column));
  }
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function buildApplicationListFilters(query) {
  const q = normalizeApplicationListQuery(query);
  const enterprise_id = parseEnterpriseIdFromQuery(q);
  const binds = createListBinds(enterprise_id);
  const parts = ['v.ENTERPRISE_ID = :p_enterprise_id'];

  appendOptionalPositiveIdFilter(binds, parts, q, 'p_application_id', 'APPLICATION_ID', 'application_id');
  for (const [bindKey, col, queryKey] of [
    ['p_posting_id', 'POSTING_ID', 'posting_id'],
    ['p_requisition_id', 'REQUISITION_ID', 'requisition_id'],
    ['p_candidate_id', 'CANDIDATE_ID', 'candidate_id']
  ]) {
    appendOptionalPositiveIdFilter(binds, parts, q, bindKey, col, queryKey);
  }

  const postingHex = parseOptionalGuidFromQuery(q, 'posting_guid');
  if (postingHex) setBindValue(binds, 'p_posting_guid', hexToRawBuffer(postingHex));
  parts.push(optionalEqClause('p_posting_guid', 'POSTING_GUID'));

  const requisitionHex = parseOptionalGuidFromQuery(q, 'requisition_guid');
  if (requisitionHex) setBindValue(binds, 'p_requisition_guid', hexToRawBuffer(requisitionHex));
  parts.push(optionalEqClause('p_requisition_guid', 'REQUISITION_GUID'));

  const candidateHex = parseOptionalGuidFromQuery(q, 'candidate_guid');
  if (candidateHex) setBindValue(binds, 'p_candidate_guid', hexToRawBuffer(candidateHex));
  parts.push(optionalEqClause('p_candidate_guid', 'CANDIDATE_GUID'));

  appendCodeFilter(
    binds,
    parts,
    q?.status_code,
    APPLICATION_STATUS_FILTER_CODES,
    'status_code',
    'p_status_code',
    'p_status_codes_csv',
    'STATUS_CODE'
  );
  appendCodeFilter(
    binds,
    parts,
    q?.current_stage_code,
    VALID_STAGE_CODES,
    'current_stage_code',
    'p_current_stage_code',
    'p_stage_codes_csv',
    'CURRENT_STAGE_CODE'
  );

  if (isNonEmptyTrimmed(q?.source_code)) {
    setBindValue(binds, 'p_source_code', String(q.source_code).trim().toUpperCase());
  }
  parts.push(optionalEqClause('p_source_code', 'SOURCE_CODE'));

  const appliedFrom = parseOptionalDate(q?.applied_date_from, 'applied_date_from');
  const appliedTo = parseOptionalDate(q?.applied_date_to, 'applied_date_to');
  if (appliedFrom && appliedTo && appliedFrom.getTime() > appliedTo.getTime()) {
    throw new ValidationError('Validation failed', ['applied_date_from must be on or before applied_date_to']);
  }
  setBindValue(binds, 'p_applied_date_from', appliedFrom);
  setBindValue(binds, 'p_applied_date_to', appliedTo);
  parts.push('(:p_applied_date_from IS NULL OR v.APPLIED_DATE >= TRUNC(:p_applied_date_from))');
  parts.push('(:p_applied_date_to IS NULL OR v.APPLIED_DATE < TRUNC(:p_applied_date_to) + 1)');

  setBindValue(binds, 'p_search_pat', toApplicationSearchPattern(pickApplicationSearchTerm(q)));
  parts.push(buildSearchWhereClause());

  if (isNonEmptyTrimmed(q?.application_number)) {
    setBindValue(
      binds,
      'p_application_number_pat',
      `%${escapeLikePattern(String(q.application_number).trim())}%`
    );
  }
  parts.push(optionalLikeClause('p_application_number_pat', 'APPLICATION_NUMBER'));

  if (isNonEmptyTrimmed(q?.candidate_name)) {
    setBindValue(binds, 'p_candidate_name_pat', `%${escapeLikePattern(String(q.candidate_name).trim())}%`);
  }
  parts.push(optionalLikeClause('p_candidate_name_pat', 'CANDIDATE_NAME'));

  if (isNonEmptyTrimmed(q?.email)) {
    setBindValue(binds, 'p_email_pat', `%${escapeLikePattern(String(q.email).trim())}%`);
  }
  parts.push(optionalLikeClause('p_email_pat', 'EMAIL'));

  if (isNonEmptyTrimmed(q?.posting_title)) {
    setBindValue(binds, 'p_posting_title_pat', `%${escapeLikePattern(String(q.posting_title).trim())}%`);
  }
  parts.push(optionalLikeClause('p_posting_title_pat', 'POSTING_TITLE'));

  if (isNonEmptyTrimmed(q?.requisition_number)) {
    setBindValue(
      binds,
      'p_requisition_number_pat',
      `%${escapeLikePattern(String(q.requisition_number).trim())}%`
    );
  }
  parts.push(optionalLikeClause('p_requisition_number_pat', 'REQUISITION_NUMBER'));

  const rejectionReason = parseQueryCodeFilter(
    q?.rejection_reason_code,
    VALID_REJECTION_REASON_CODES,
    'rejection_reason_code'
  );
  if (rejectionReason && !rejectionReason.includes(',')) {
    setBindValue(binds, 'p_rejection_reason_code', rejectionReason);
  }
  parts.push(optionalEqClause('p_rejection_reason_code', 'REJECTION_REASON_CODE'));

  const whereSql = `WHERE ${parts.join(' AND ')}`;
  return { whereSql, binds: pruneBindsForSql(whereSql, binds) };
}
