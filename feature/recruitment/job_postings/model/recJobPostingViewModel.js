import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import {
  FETCH_ERROR_MESSAGE,
  JOB_POSTING_SELECT_SQL,
  LOG_TAG,
  REC_JOB_POSTINGS_VIEW
} from '../utils/recJobPostingConstants.js';
import { buildJobPostingListFilters } from '../utils/recJobPostingListFilters.js';
import { mapJobPostingViewRow } from '../utils/recJobPostingViewMapper.js';
import { parseJobPostingSort } from '../utils/recJobPostingViewValidators.js';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export async function listJobPostingsFromView(query) {
  try {
    const { page, limit } = parseListPagination(query);
    const orderSql = parseJobPostingSort(query);
    const { whereSql, binds } = buildJobPostingListFilters(query);
    const selectSql = `SELECT ${JOB_POSTING_SELECT_SQL} FROM ${REC_JOB_POSTINGS_VIEW} v`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_JOB_POSTINGS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapJobPostingViewRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listJobPostingsFromView`, FETCH_ERROR_MESSAGE);
  }
}

/**
 * @param {string} postingGuidHex
 * @param {number} enterpriseId
 */
export async function getJobPostingByGuidFromView(postingGuidHex, enterpriseId) {
  const guidBuf = hexToRawBuffer(postingGuidHex);
  const sql = `SELECT ${JOB_POSTING_SELECT_SQL} FROM ${REC_JOB_POSTINGS_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id AND v.POSTING_GUID = :p_posting_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        {
          p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
          p_posting_guid: { val: guidBuf, dir: oracledb.BIND_IN, type: oracledb.BUFFER, maxSize: 16 }
        },
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return mapJobPostingViewRow(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getJobPostingByGuidFromView`, FETCH_ERROR_MESSAGE);
  }
}
