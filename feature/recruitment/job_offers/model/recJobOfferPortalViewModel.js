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
  JOB_OFFER_MANAGEMENT_LIST_ORDER_SQL,
  JOB_OFFER_MANAGEMENT_SELECT_SQL,
  LOG_TAG,
  REC_JOB_OFFER_MANAGEMENT_VIEW
} from '../utils/recJobOfferConstants.js';
import { mapJobOfferManagementListRow } from '../utils/recJobOfferManagementMappers.js';
import { buildJobOfferPortalListFilters } from '../utils/recJobOfferPortalListFilters.js';
import {
  mapJobOfferPortalDetail,
  mapJobOfferPortalListRow
} from '../utils/recJobOfferPortalMappers.js';
import { PORTAL_READ_ERROR_MESSAGE, OFFER_STATUS_EXTENDED } from '../utils/recJobOfferPortalConstants.js';
import { OFFER_BY_GUID_WHERE, offerGuidBinds } from '../utils/recJobOfferRowUtils.js';
import { getJobOfferByGuid } from './recJobOfferViewModel.js';

const OFFERS_TABLE = 'REC.REC_JOB_OFFERS';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export async function listExtendedOffersForCandidate(query) {
  try {
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildJobOfferPortalListFilters(query);
    const selectSql = `SELECT ${JOB_OFFER_MANAGEMENT_SELECT_SQL} FROM ${REC_JOB_OFFER_MANAGEMENT_VIEW} v`;

    const result = await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_JOB_OFFER_MANAGEMENT_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql: JOB_OFFER_MANAGEMENT_LIST_ORDER_SQL,
        page,
        limit,
        mapRow: async (row) => {
          const mapped = await mapJobOfferManagementListRow(row);
          return mapJobOfferPortalListRow(mapped);
        }
      })
    );

    return result;
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listExtendedOffersForCandidate`, PORTAL_READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} offerGuidHex
 * @param {number} enterpriseId
 * @param {string} candidateGuidHex
 */
export async function extendedOfferBelongsToCandidate(offerGuidHex, enterpriseId, candidateGuidHex) {
  const sql = `SELECT 1 AS FOUND FROM ${OFFERS_TABLE} o
    ${OFFER_BY_GUID_WHERE}
      AND o.ENTERPRISE_ID = :p_enterprise_id
      AND o.CANDIDATE_GUID = :p_candidate_guid
      AND UPPER(o.STATUS_CODE) = :p_status_code
    FETCH FIRST 1 ROWS ONLY`;

  const binds = {
    ...offerGuidBinds(offerGuidHex),
    p_enterprise_id: { val: enterpriseId, dir: oracledb.BIND_IN, type: oracledb.NUMBER },
    p_candidate_guid: {
      val: hexToRawBuffer(candidateGuidHex),
      dir: oracledb.BIND_IN,
      type: oracledb.BUFFER,
      maxSize: 16
    },
    p_status_code: {
      val: OFFER_STATUS_EXTENDED,
      dir: oracledb.BIND_IN,
      type: oracledb.STRING,
      maxSize: 60
    }
  };

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(sql, binds, ROW_OPTS);
      return Boolean(r.rows?.[0]);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} extendedOfferBelongsToCandidate`, PORTAL_READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} offerGuidHex
 * @param {number} enterpriseId
 * @param {string} candidateGuidHex
 */
export async function getExtendedOfferForCandidate(offerGuidHex, enterpriseId, candidateGuidHex) {
  try {
    const belongs = await extendedOfferBelongsToCandidate(offerGuidHex, enterpriseId, candidateGuidHex);
    if (!belongs) return null;

    const detail = await getJobOfferByGuid(offerGuidHex);
    if (!detail) return null;

    return mapJobOfferPortalDetail(detail);
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getExtendedOfferForCandidate`, PORTAL_READ_ERROR_MESSAGE);
  }
}
