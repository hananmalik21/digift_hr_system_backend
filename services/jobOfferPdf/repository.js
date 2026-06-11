import { parseJsonColumnOrDefault } from '../../feature/recruitment/shared/recViewJsonParse.js';
import {
  ROW_OPTS,
  rethrowUnlessOperational,
  withConnection
} from '../../feature/recruitment/shared/recViewModelUtils.js';
import {
  READ_ERROR_MESSAGE,
  REC_JOB_OFFER_MANAGEMENT_VIEW
} from '../../feature/recruitment/job_offers/utils/recJobOfferConstants.js';
import {
  formatDateOnly,
  formatDateTime,
  normalizeGuidValue,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from '../../feature/recruitment/job_offers/utils/recJobOfferRowUtils.js';
import { buildOfferByGuidSql, LOG_TAG } from './constants.js';

/** @typedef {import('./types.js').NormalizedJobOffer} NormalizedJobOffer */

const OFFER_JSON_FIELDS = [
  { key: 'candidate_obj', asArray: false },
  { key: 'posting_obj', asArray: false },
  { key: 'position_obj', asArray: false },
  { key: 'department_obj', asArray: false },
  { key: 'grade_obj', asArray: false },
  { key: 'components_json', asArray: true },
  { key: 'benefits_json', asArray: false },
  { key: 'terms_json', asArray: false }
];

/**
 * @param {Record<string, unknown>} rowMap
 */
async function parseOfferJsonColumns(rowMap) {
  const parsed = {};
  await Promise.all(
    OFFER_JSON_FIELDS.map(async ({ key, asArray }) => {
      parsed[key] = await parseJsonColumnOrDefault(rowMap[key], asArray);
    })
  );
  return parsed;
}

/**
 * @param {Record<string, unknown>} row
 * @returns {Promise<NormalizedJobOffer>}
 */
export async function normalizeOffer(row) {
  const m = rowKeyMap(row);
  const jsonFields = await parseOfferJsonColumns(m);

  return {
    offer_id: safeFiniteNumber(m.offer_id),
    offer_guid: normalizeGuidValue(m.offer_guid),
    offer_number: strOrNull(m.offer_number),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    enterprise_name: strOrNull(m.enterprise_name),
    posting_id: safeFiniteNumber(m.posting_id),
    posting_title: strOrNull(m.posting_title),
    job_title: strOrNull(m.job_title),
    location: strOrNull(m.location),
    work_mode_code: strOrNull(m.work_mode_code),
    employment_type_code: strOrNull(m.employment_type_code),
    start_date: formatDateOnly(m.start_date),
    offer_date: formatDateOnly(m.offer_date),
    expiry_date: formatDateOnly(m.expiry_date),
    status_code: strOrNull(m.status_code),
    approval_status: strOrNull(m.approval_status),
    display_status: strOrNull(m.display_status),
    stage: strOrNull(m.stage),
    stage_description: strOrNull(m.stage_description),
    annual_salary: safeFiniteNumber(m.annual_salary),
    comments: strOrNull(m.comments),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateTime(m.creation_date),
    last_updated_by: strOrNull(m.last_updated_by),
    last_update_date: formatDateTime(m.last_update_date),
    candidate_obj: jsonFields.candidate_obj || {},
    posting_obj: jsonFields.posting_obj || {},
    position_obj: jsonFields.position_obj || {},
    department_obj: jsonFields.department_obj || {},
    grade_obj: jsonFields.grade_obj || {},
    components_json: Array.isArray(jsonFields.components_json) ? jsonFields.components_json : [],
    benefits_json: jsonFields.benefits_json || {},
    terms_json: jsonFields.terms_json || {}
  };
}

/**
 * @param {string} offerGuidHex
 * @returns {Promise<NormalizedJobOffer|null>}
 */
export async function getOfferByGuid(offerGuidHex) {
  const sql = buildOfferByGuidSql(REC_JOB_OFFER_MANAGEMENT_VIEW);

  try {
    return await withConnection(async (connection) => {
      const result = await connection.execute(
        sql,
        { offerGuid: offerGuidHex.toUpperCase() },
        ROW_OPTS
      );
      const row = result.rows?.[0];
      if (!row) return null;
      return normalizeOffer(row);
    });
  } catch (err) {
    rethrowUnlessOperational(err, `${LOG_TAG} getOfferByGuid`, READ_ERROR_MESSAGE);
  }
}
