import {
  formatDateOnly,
  mapOfferStageFields,
  normalizeGuidValue,
  normalizeYnFlag,
  rowKeyMap,
  safeFiniteNumber,
  strOrNull
} from './recJobOfferRowUtils.js';

/** @param {Record<string, unknown>} row */
export function mapJobOfferDetailOffer(row) {
  const m = rowKeyMap(row);

  return {
    offer_guid: normalizeGuidValue(m.offer_guid),
    offer_number: strOrNull(m.offer_number),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    application_guid: normalizeGuidValue(m.application_guid),
    application_number: strOrNull(m.application_number),
    resume_url: strOrNull(m.resume_url),
    candidate_guid: normalizeGuidValue(m.candidate_guid),
    candidate_name: strOrNull(m.candidate_name),
    posting_id: safeFiniteNumber(m.posting_id),
    job_title: strOrNull(m.job_title),
    position_id: normalizeGuidValue(m.position_id),
    position_name: strOrNull(m.position_name),
    department_id: normalizeGuidValue(m.department_id),
    department_name: strOrNull(m.department_name),
    location: strOrNull(m.location),

    work_mode_code: strOrNull(m.work_mode_code),
    employment_type_code: strOrNull(m.employment_type_code),
    grade_id: safeFiniteNumber(m.grade_id),
    reporting_manager_id: safeFiniteNumber(m.reporting_manager_id),
    start_date: formatDateOnly(m.start_date),
    offer_date: formatDateOnly(m.offer_date),
    expiry_date: formatDateOnly(m.expiry_date),
    ...mapOfferStageFields(m),
    decline_comments: strOrNull(m.decline_comments),
    comments: strOrNull(m.comments),
    created_by: strOrNull(m.created_by),
    creation_date: formatDateOnly(m.creation_date),
    last_updated_by: strOrNull(m.last_updated_by),
    last_update_date: formatDateOnly(m.last_update_date)
  };
}

/** @param {Record<string, unknown>} row */
export function mapJobOfferComponentRow(row) {
  const m = rowKeyMap(row);
  return {
    plan_id: safeFiniteNumber(m.plan_id),
    component_id: safeFiniteNumber(m.component_id),
    amount: safeFiniteNumber(m.amount),
    currency_code: strOrNull(m.currency_code),
    frequency_code: strOrNull(m.frequency_code)
  };
}

/** @param {Record<string, unknown>|undefined} row */
export function mapJobOfferBenefitsRow(row) {
  if (!row) return {};
  const m = rowKeyMap(row);
  return {
    health_insurance: normalizeYnFlag(m.health_insurance),
    dental_insurance: normalizeYnFlag(m.dental_insurance),
    vision_insurance: normalizeYnFlag(m.vision_insurance),
    life_insurance: normalizeYnFlag(m.life_insurance),
    retirement_plan: strOrNull(m.retirement_plan),
    pto_days: safeFiniteNumber(m.pto_days),
    sick_days: safeFiniteNumber(m.sick_days),
    personal_days: safeFiniteNumber(m.personal_days),
    parental_leave: strOrNull(m.parental_leave),
    additional_benefits: strOrNull(m.additional_benefits)
  };
}

/** @param {Record<string, unknown>|undefined} row */
export function mapJobOfferTermsRow(row) {
  if (!row) return {};
  const m = rowKeyMap(row);
  return {
    probation_period: strOrNull(m.probation_period),
    offer_expiry_date: formatDateOnly(m.offer_expiry_date),
    background_check_required: normalizeYnFlag(m.background_check_required),
    drug_test_required: normalizeYnFlag(m.drug_test_required),
    nda_required: normalizeYnFlag(m.nda_required),
    non_compete_required: normalizeYnFlag(m.non_compete_required),
    additional_terms: strOrNull(m.additional_terms)
  };
}
