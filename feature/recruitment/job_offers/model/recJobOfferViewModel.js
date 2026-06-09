import oracledb from 'oracledb';
import {
  fetchPaginatedRows,
  rethrowUnlessOperational,
  ROW_OPTS,
  withConnection
} from '../../shared/recViewModelUtils.js';
import { parseListPagination } from '../../shared/recViewQueryValidators.js';
import {
  JOB_OFFER_LIST_SELECT_SQL,
  LOG_TAG,
  READ_ERROR_MESSAGE,
  REC_JOB_OFFERS_VIEW
} from '../utils/recJobOfferConstants.js';
import { buildJobOfferListFilters } from '../utils/recJobOfferListFilters.js';
import {
  mapJobOfferBenefitsRow,
  mapJobOfferComponentRow,
  mapJobOfferDetailOffer,
  mapJobOfferListRow,
  mapJobOfferTermsRow
} from '../utils/recJobOfferMappers.js';
import { OFFER_BY_GUID_WHERE, offerGuidBinds, rowKeyMap, safeFiniteNumber } from '../utils/recJobOfferRowUtils.js';

const OFFERS_TABLE = 'REC.REC_JOB_OFFERS';

/**
 * @param {Record<string, unknown>|undefined} query
 */
export async function listJobOffersFromView(query) {
  try {
    const { page, limit } = parseListPagination(query);
    const { whereSql, binds } = buildJobOfferListFilters(query);
    const selectSql = `SELECT ${JOB_OFFER_LIST_SELECT_SQL} FROM ${REC_JOB_OFFERS_VIEW} v`;

    return await withConnection((connection) =>
      fetchPaginatedRows(connection, {
        view: REC_JOB_OFFERS_VIEW,
        selectSql,
        whereSql,
        binds,
        orderSql: 'ORDER BY v.OFFER_DATE DESC NULLS LAST, v.OFFER_NUMBER DESC NULLS LAST',
        page,
        limit,
        mapRow: mapJobOfferListRow
      })
    );
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} listJobOffersFromView`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} offerGuidHex
 */
export async function jobOfferExists(offerGuidHex) {
  const sql = `SELECT 1 AS FOUND FROM ${OFFERS_TABLE} o
    ${OFFER_BY_GUID_WHERE} FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const r = await connection.execute(sql, offerGuidBinds(offerGuidHex), ROW_OPTS);
      return Boolean(r.rows?.[0]);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} jobOfferExists`, READ_ERROR_MESSAGE);
  }
}

/**
 * @param {string} offerGuidHex
 */
export async function getJobOfferByGuid(offerGuidHex) {
  const offerSql = `SELECT
      o.OFFER_GUID,
      o.OFFER_NUMBER,
      o.ENTERPRISE_ID,
      a.APPLICATION_GUID,
      a.APPLICATION_NUMBER,
      o.CANDIDATE_GUID,
      TRIM(c.FIRST_NAME || ' ' || NVL(c.MIDDLE_NAME, '') || ' ' || c.LAST_NAME) AS CANDIDATE_NAME,
      o.POSTING_ID,
      o.JOB_TITLE,
      o.POSITION_ID,
      p.POSITION_TITLE_EN AS POSITION_NAME,
      o.DEPARTMENT_ID,
      ou.ORG_UNIT_NAME_EN AS DEPARTMENT_NAME,
      o.LOCATION,
      o.WORK_MODE_CODE,
      o.EMPLOYMENT_TYPE_CODE,
      o.GRADE_ID,
      o.REPORTING_MANAGER_ID,
      o.START_DATE,
      o.OFFER_DATE,
      o.EXPIRY_DATE,
      o.STAGE,
      o.STATUS_CODE,
      o.STAGE_DESCRIPTION,
      o.DECLINE_COMMENTS,
      o.COMMENTS,
      o.CREATED_BY,
      o.CREATION_DATE,
      o.LAST_UPDATED_BY,
      o.LAST_UPDATE_DATE,
      o.OFFER_ID
    FROM ${OFFERS_TABLE} o
    LEFT JOIN REC.REC_APPLICATIONS a
      ON a.APPLICATION_ID = o.APPLICATION_ID AND a.ENTERPRISE_ID = o.ENTERPRISE_ID
    LEFT JOIN REC.CANDIDATES c
      ON c.CANDIDATE_GUID = o.CANDIDATE_GUID AND c.ENTERPRISE_ID = o.ENTERPRISE_ID
    LEFT JOIN ENT.POSITIONS p ON p.POSITION_ID = o.POSITION_ID
    LEFT JOIN ENT.ORG_UNITS ou ON ou.ORG_UNIT_ID = o.DEPARTMENT_ID
    ${OFFER_BY_GUID_WHERE}`;

  const componentsSql = `SELECT PLAN_ID, COMPONENT_ID, AMOUNT, CURRENCY_CODE, FREQUENCY_CODE
    FROM REC.REC_JOB_OFFER_COMPONENTS
    WHERE OFFER_ID = :p_offer_id
    ORDER BY OFFER_COMPONENT_ID`;

  const benefitsSql = `SELECT HEALTH_INSURANCE, DENTAL_INSURANCE, VISION_INSURANCE, LIFE_INSURANCE,
      RETIREMENT_PLAN, PTO_DAYS, SICK_DAYS, PERSONAL_DAYS, PARENTAL_LEAVE, ADDITIONAL_BENEFITS
    FROM REC.REC_JOB_OFFER_BENEFITS
    WHERE OFFER_ID = :p_offer_id FETCH FIRST 1 ROWS ONLY`;

  const termsSql = `SELECT PROBATION_PERIOD, OFFER_EXPIRY_DATE, BACKGROUND_CHECK_REQUIRED,
      DRUG_TEST_REQUIRED, NDA_REQUIRED, NON_COMPETE_REQUIRED, ADDITIONAL_TERMS
    FROM REC.REC_JOB_OFFER_TERMS
    WHERE OFFER_ID = :p_offer_id FETCH FIRST 1 ROWS ONLY`;

  try {
    return await withConnection(async (connection) => {
      const offerResult = await connection.execute(
        offerSql,
        offerGuidBinds(offerGuidHex),
        ROW_OPTS
      );
      const offerRow = offerResult.rows?.[0];
      if (!offerRow) return null;

      const offerId = safeFiniteNumber(rowKeyMap(offerRow).offer_id);
      if (offerId == null) return null;

      const idBind = {
        p_offer_id: { val: offerId, dir: oracledb.BIND_IN, type: oracledb.NUMBER }
      };

      const [componentsResult, benefitsResult, termsResult] = await Promise.all([
        connection.execute(componentsSql, idBind, ROW_OPTS),
        connection.execute(benefitsSql, idBind, ROW_OPTS),
        connection.execute(termsSql, idBind, ROW_OPTS)
      ]);

      return {
        offer: mapJobOfferDetailOffer(offerRow),
        components: (componentsResult.rows || []).map((row) => mapJobOfferComponentRow(row)),
        benefits: mapJobOfferBenefitsRow(benefitsResult.rows?.[0]),
        terms: mapJobOfferTermsRow(termsResult.rows?.[0])
      };
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getJobOfferByGuid`, READ_ERROR_MESSAGE);
  }
}
