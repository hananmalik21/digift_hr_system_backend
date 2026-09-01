import oracledb from 'oracledb';
import { hexToRawBuffer } from '@digifyhr/common';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import {
  buildInterviewListFilters,
  normalizeInterviewListQuery,
  parseInterviewSort
} from '../utils/recCandidateInterviewListFilters.js';
import { mapCandidateInterviewViewRow } from '../utils/recCandidateInterviewViewMapper.js';
import {
  INTERVIEW_SELECT_SQL,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_CANDIDATE_INTERVIEWS_VIEW
} from '../utils/recCandidateInterviewViewConstants.js';

/**
 * @param {Record<string, unknown>|undefined} query
 * @returns {Promise<{ rows: Record<string, unknown>[], total: number, page: number, limit: number }>}
 */
export async function listInterviewsFromView(query) {
  try {
    const normalized = normalizeInterviewListQuery(query);
    const { page, limit } = parseListPagination(normalized);
    const { whereSql, binds } = buildInterviewListFilters(normalized);
    const selectSql = `SELECT ${INTERVIEW_SELECT_SQL} FROM ${REC_CANDIDATE_INTERVIEWS_VIEW} v`;
    const orderSql = parseInterviewSort(normalized);

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_CANDIDATE_INTERVIEWS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapCandidateInterviewViewRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listInterviewsFromView`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} interviewGuidHex
 * @param {number} enterpriseId
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function getInterviewByGuidFromView(interviewGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(interviewGuidHex);
  const sql = `SELECT ${INTERVIEW_SELECT_SQL} FROM ${REC_CANDIDATE_INTERVIEWS_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.INTERVIEW_GUID = :p_interview_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_interview_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return mapCandidateInterviewViewRow(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getInterviewByGuidFromView`, READ_ERROR_MESSAGE);
  }
}
