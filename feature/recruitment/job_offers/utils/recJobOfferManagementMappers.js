import { parseJsonColumnOrDefault } from '../../shared/recViewJsonParse.js';
import { normalizeGuidInJsonObject } from '../../shared/recViewJsonUtils.js';
import { JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS } from './recJobOfferConstants.js';
import {
  formatDateOnly,
  formatDateTime,
  mapOfferStageFields,
  normalizeGuidValue,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from './recJobOfferRowUtils.js';

/**
 * @param {Record<string, unknown>|null|undefined} obj
 * @param {string[]} guidFields
 */
function normalizeGuidFieldsInObject(obj, guidFields) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const field of guidFields) {
    normalizeGuidInJsonObject(/** @type {Record<string, unknown>} */ (obj), field);
  }
}

/** @param {Record<string, unknown>} row */
export async function mapJobOfferManagementListRow(row) {
  const m = rowKeyMap(row);

  const [
    candidate_obj,
    posting_obj,
    position_obj,
    department_obj,
    grade_obj,
    components_json,
    benefits_json,
    terms_json
  ] = await Promise.all([
    parseJsonColumnOrDefault(m.candidate_obj, false),
    parseJsonColumnOrDefault(m.posting_obj, false),
    parseJsonColumnOrDefault(m.position_obj, false),
    parseJsonColumnOrDefault(m.department_obj, false),
    parseJsonColumnOrDefault(m.grade_obj, false),
    parseJsonColumnOrDefault(m.components_json, true),
    parseJsonColumnOrDefault(m.benefits_json, false),
    parseJsonColumnOrDefault(m.terms_json, false)
  ]);

  for (const [obj, fields] of [
    [candidate_obj, JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS.candidate_obj],
    [posting_obj, JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS.posting_obj],
    [position_obj, JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS.position_obj],
    [department_obj, JOB_OFFER_MANAGEMENT_JSON_GUID_FIELDS.department_obj]
  ]) {
    normalizeGuidFieldsInObject(obj, fields);
  }

  return {
    offer_id: safeFiniteNumber(m.offer_id),
    offer_guid: normalizeGuidValue(m.offer_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    application_id: safeFiniteNumber(m.application_id),
    resume_url: strOrNull(m.resume_url),
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    posting_id: safeFiniteNumber(m.posting_id),
    offer_number: strOrNull(m.offer_number),

    posting_guid: normalizeGuidValue(m.posting_guid),
    posting_title: strOrNull(m.posting_title),

    job_title: strOrNull(m.job_title),
    location: strOrNull(m.location),
    work_mode_code: strOrNull(m.work_mode_code),
    employment_type_code: strOrNull(m.employment_type_code),

    start_date: formatDateOnly(m.start_date),
    offer_date: formatDateOnly(m.offer_date),
    expiry_date: formatDateOnly(m.expiry_date),

    approval_status: strOrNull(m.approval_status),
    display_status: strOrNull(m.display_status),
    ...mapOfferStageFields(m),

    annual_salary: safeFiniteNumber(m.annual_salary),

    candidate_obj,
    posting_obj,
    position_obj,
    department_obj,
    grade_obj,

    components_json,
    benefits_json,
    terms_json,

    comments: strOrNull(m.comments),
    decline_comments: strOrNull(m.decline_comments),

    created_by: strOrNull(m.created_by),
    creation_date: formatDateTime(m.creation_date),
    last_updated_by: strOrNull(m.last_updated_by),
    last_update_date: formatDateTime(m.last_update_date)
  };
}
