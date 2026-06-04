import oracledb from 'oracledb';
import { ValidationError } from '../../../../utils/errors/index.js';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import { escapeLikePattern } from '../../../security/modules/utils/escapeLikePattern.js';
import {
  optionalEqClause,
  pruneBindsForSql,
  setBindValue
} from '../../shared/recViewListSql.js';
import { isNonEmptyTrimmed } from '../../shared/recViewModelUtils.js';
import { parseEnterpriseIdFromQuery } from '../../shared/recViewQueryValidators.js';
import { parseHexGuidParam } from '../../shared/recValidationUtils.js';
import {
  INTERVIEW_RESULT_STATUSES,
  INTERVIEW_STATUS_CODES
} from './recCandidateInterviewConstants.js';
import { INTERVIEW_SORT_COLUMNS } from './recCandidateInterviewViewConstants.js';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function normalizeInterviewListQuery(query) {
  const q = { ...(query || {}) };
  if (q.active_flag == null || String(q.active_flag).trim() === '') {
    q.active_flag = 'Y';
  }
  return q;
}

/**
 * @param {Record<string, unknown>|undefined} query
 */
export function parseInterviewSort(query) {
  const raw = query?.sort_by ?? query?.sortBy ?? 'interview_start_utc';
  const sortBy = String(raw).trim().toLowerCase();
  const col = INTERVIEW_SORT_COLUMNS[sortBy] || INTERVIEW_SORT_COLUMNS.interview_start_utc;
  const dirRaw = String(query?.sort_dir ?? query?.sortDir ?? 'desc').trim().toUpperCase();
  const dir = dirRaw === 'ASC' ? 'ASC' : 'DESC';
  return `ORDER BY v.${col} ${dir} NULLS LAST, v.INTERVIEW_ID DESC`;
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
    throw new ValidationError('Validation failed', [`${label} must be a valid date`]);
  }
  return d;
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {{ whereSql: string, binds: Record<string, unknown> }}
 */
export function buildInterviewListFilters(query) {
  const enterprise_id = parseEnterpriseIdFromQuery(query);
  const binds = {
    p_enterprise_id: { val: enterprise_id, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: { val: null, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 },
    p_status: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_result_status: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 50 },
    p_active_flag: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 1 },
    p_search_pat: { val: null, dir: oracledb.BIND_IN, type: oracledb.STRING, maxSize: 4000 },
    p_interview_date_from: { val: null, dir: oracledb.BIND_IN, type: oracledb.DATE },
    p_interview_date_to: { val: null, dir: oracledb.BIND_IN, type: oracledb.DATE }
  };

  const parts = ['v.ENTERPRISE_ID = :p_enterprise_id'];

  if (isNonEmptyTrimmed(query?.candidate_guid)) {
    try {
      const candidateHex = parseHexGuidParam(query.candidate_guid, {
        requiredMessage: 'candidate_guid must be a valid 32-character hex GUID',
        invalidMessage: 'candidate_guid must be a valid 32-character hex GUID'
      });
      setBindValue(binds, 'p_candidate_guid', hexToRawBuffer(candidateHex));
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('Validation failed', [
        'candidate_guid must be a valid 32-character hex GUID'
      ]);
    }
  }
  parts.push(optionalEqClause('p_candidate_guid', 'CANDIDATE_GUID'));

  if (isNonEmptyTrimmed(query?.status ?? query?.status_code)) {
    const status = String(query.status ?? query.status_code).trim().toUpperCase();
    if (!INTERVIEW_STATUS_CODES.has(status)) {
      throw new ValidationError('Validation failed', [
        'status must be SCHEDULED, COMPLETED, CANCELLED, or RESCHEDULED'
      ]);
    }
    setBindValue(binds, 'p_status', status);
  }
  parts.push(optionalEqClause('p_status', 'STATUS'));

  if (isNonEmptyTrimmed(query?.result_status)) {
    const rs = String(query.result_status).trim().toUpperCase();
    if (!INTERVIEW_RESULT_STATUSES.has(rs)) {
      throw new ValidationError('Validation failed', [
        'result_status must be PENDING, SELECTED, REJECTED, or ON_HOLD'
      ]);
    }
    setBindValue(binds, 'p_result_status', rs);
  }
  parts.push(optionalEqClause('p_result_status', 'RESULT_STATUS'));

  if (isNonEmptyTrimmed(query?.active_flag)) {
    const flag = String(query.active_flag).trim().toUpperCase();
    if (flag !== 'Y' && flag !== 'N') {
      throw new ValidationError('Validation failed', ['active_flag must be Y or N']);
    }
    setBindValue(binds, 'p_active_flag', flag);
  }
  parts.push(optionalEqClause('p_active_flag', 'ACTIVE_FLAG'));

  if (isNonEmptyTrimmed(query?.search)) {
    setBindValue(binds, 'p_search_pat', `%${escapeLikePattern(String(query.search).trim())}%`);
  }
  parts.push(`(
    :p_search_pat IS NULL
    OR LOWER(v.CANDIDATE_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
    OR LOWER(v.FIRST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
    OR LOWER(v.LAST_NAME) LIKE LOWER(:p_search_pat) ESCAPE '\\'
    OR LOWER(v.EMAIL) LIKE LOWER(:p_search_pat) ESCAPE '\\'
    OR LOWER(v.INTERVIEW_TITLE) LIKE LOWER(:p_search_pat) ESCAPE '\\'
  )`);

  const dateFrom = parseOptionalDate(query?.interview_date_from, 'interview_date_from');
  const dateTo = parseOptionalDate(query?.interview_date_to, 'interview_date_to');
  if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
    throw new ValidationError('Validation failed', [
      'interview_date_from must be on or before interview_date_to'
    ]);
  }
  setBindValue(binds, 'p_interview_date_from', dateFrom);
  setBindValue(binds, 'p_interview_date_to', dateTo);
  parts.push('(:p_interview_date_from IS NULL OR v.INTERVIEW_DATE >= TRUNC(:p_interview_date_from))');
  parts.push('(:p_interview_date_to IS NULL OR v.INTERVIEW_DATE <= TRUNC(:p_interview_date_to))');

  const whereSql = `WHERE ${parts.join(' AND ')}`;
  return { whereSql, binds: pruneBindsForSql(whereSql, binds) };
}
