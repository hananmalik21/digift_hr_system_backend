import oracledb from 'oracledb';
import { hexToRawBuffer } from '../../../../utils/guidUtils.js';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { buildCandidateMatchListFilters } from '../utils/recCandidateMatchFilters.js';
import { mapCandidateMatchRow, normalizeGuidValue, strOrNull } from '../utils/recCandidateMatchMappers.js';
import {
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_CANDIDATE_MATCH_VIEW,
  REC_REQUISITION_LIST_VIEW
} from '../utils/recCandidateMatchConstants.js';
import { parseFindCandidatesPagination } from '../utils/recCandidateMatchValidators.js';

function guidEnterpriseBinds(guidHex, enterpriseId, guidBindName) {
  return {
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    [guidBindName]: {
      val: hexToRawBuffer(guidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    }
  };
}

/**
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 */
export async function getRequisitionHeaderFromView(requisitionGuidHex, enterpriseId) {
  const sql = `SELECT v.REQUISITION_GUID, v.REQUISITION_NUMBER, v.REQUISITION_TITLE, v.ENTERPRISE_ID
    FROM ${REC_REQUISITION_LIST_VIEW} v
    WHERE v.ENTERPRISE_ID = :p_enterprise_id
      AND v.REQUISITION_GUID = :p_requisition_guid
    FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(
        sql,
        guidEnterpriseBinds(requisitionGuidHex, enterpriseId, 'p_requisition_guid'),
        ROW_OPTS
      );
      const row = r.rows?.[0];
      if (!row) return null;
      return {
        requisition_guid: normalizeGuidValue(row.REQUISITION_GUID ?? row.requisition_guid),
        requisition_number: strOrNull(row.REQUISITION_NUMBER ?? row.requisition_number),
        requisition_title: strOrNull(row.REQUISITION_TITLE ?? row.requisition_title),
        enterprise_id: Number(row.ENTERPRISE_ID ?? row.enterprise_id)
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getRequisitionHeaderFromView`, READ_ERROR_MESSAGE);
  }
}

/**
 * Database-level pagination/filter/sort against REC.V_REQUISITION_CANDIDATE_MATCH.
 * Application status columns come from the view — no REC.REC_APPLICATIONS N+1 join.
 *
 * @param {string} requisitionGuidHex
 * @param {number} enterpriseId
 * @param {Record<string, unknown>|undefined} query
 */
export async function listCandidateMatchesFromView(requisitionGuidHex, enterpriseId, query) {
  try {
    const { page, limit } = parseFindCandidatesPagination(query);
    const { whereSql, binds, orderSql } = buildCandidateMatchListFilters(
      requisitionGuidHex,
      enterpriseId,
      query
    );
    // Prefer TO_CHAR for dates so calendar days are not shifted by timezone.
    const selectSql = `SELECT
  v.*,
  TO_CHAR(v.ESTIMATED_AVAILABLE_DATE, 'YYYY-MM-DD') AS ESTIMATED_AVAILABLE_DATE_ISO,
  TO_CHAR(v.APPLICATION_APPLIED_DATE, 'YYYY-MM-DD') AS APPLICATION_APPLIED_DATE_ISO
      FROM ${REC_CANDIDATE_MATCH_VIEW} v`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_CANDIDATE_MATCH_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql,
        page,
        limit,
        mapRow: mapCandidateMatchRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listCandidateMatchesFromView`, READ_ERROR_MESSAGE);
  }
}
