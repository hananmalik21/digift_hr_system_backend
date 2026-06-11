/** @param {Record<string, unknown>} row */
export function mapJobOfferPortalListRow(row) {
  return {
    offer_guid: row.offer_guid ?? null,
    offer_number: row.offer_number ?? null,
    job_title: row.job_title ?? null,
    location: row.location ?? null,
    work_mode_code: row.work_mode_code ?? null,
    employment_type_code: row.employment_type_code ?? null,
    start_date: row.start_date ?? null,
    offer_date: row.offer_date ?? null,
    expiry_date: row.expiry_date ?? null,
    stage: row.stage ?? null,
    status_code: row.status_code ?? null,
    stage_description: row.stage_description ?? null,
    annual_salary: row.annual_salary ?? null,
    posting_obj: row.posting_obj ?? null,
    position_obj: row.position_obj ?? null,
    department_obj: row.department_obj ?? null,
    grade_obj: row.grade_obj ?? null,
    components_json: row.components_json ?? null,
    benefits_json: row.benefits_json ?? null,
    terms_json: row.terms_json ?? null
  };
}

/**
 * @param {{ offer: Record<string, unknown>, components: unknown[], benefits: Record<string, unknown>, terms: Record<string, unknown> }} detail
 */
export function mapJobOfferPortalDetail(detail) {
  const offer = detail.offer ?? {};
  return {
    offer: {
      offer_guid: offer.offer_guid ?? null,
      offer_number: offer.offer_number ?? null,
      application_guid: offer.application_guid ?? null,
      application_number: offer.application_number ?? null,
      job_title: offer.job_title ?? null,
      position_name: offer.position_name ?? null,
      department_name: offer.department_name ?? null,
      location: offer.location ?? null,
      work_mode_code: offer.work_mode_code ?? null,
      employment_type_code: offer.employment_type_code ?? null,
      start_date: offer.start_date ?? null,
      offer_date: offer.offer_date ?? null,
      expiry_date: offer.expiry_date ?? null,
      stage: offer.stage ?? null,
      status_code: offer.status_code ?? null,
      stage_description: offer.stage_description ?? null
    },
    components: detail.components ?? [],
    benefits: detail.benefits ?? {},
    terms: detail.terms ?? {}
  };
}
