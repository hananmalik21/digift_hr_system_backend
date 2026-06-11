/**
 * @typedef {Object} NormalizedJobOffer
 * @property {number|null} offer_id
 * @property {string|null} offer_guid
 * @property {string|null} offer_number
 * @property {number|null} enterprise_id
 * @property {string|null} enterprise_name
 * @property {number|null} posting_id
 * @property {string|null} posting_title
 * @property {string|null} job_title
 * @property {string|null} location
 * @property {string|null} work_mode_code
 * @property {string|null} employment_type_code
 * @property {string|null} start_date
 * @property {string|null} offer_date
 * @property {string|null} expiry_date
 * @property {string|null} status_code
 * @property {string|null} approval_status
 * @property {string|null} display_status
 * @property {string|null} stage
 * @property {string|null} stage_description
 * @property {number|null} annual_salary
 * @property {string|null} comments
 * @property {string|null} created_by
 * @property {string|null} creation_date
 * @property {string|null} last_updated_by
 * @property {string|null} last_update_date
 * @property {Record<string, unknown>} candidate_obj
 * @property {Record<string, unknown>} posting_obj
 * @property {Record<string, unknown>} position_obj
 * @property {Record<string, unknown>} department_obj
 * @property {Record<string, unknown>} grade_obj
 * @property {Record<string, unknown>[]} components_json
 * @property {Record<string, unknown>} benefits_json
 * @property {Record<string, unknown>} terms_json
 */

/**
 * @typedef {Object} OfferLetterTemplateData
 * @property {string} companyName
 * @property {string} candidateName
 * @property {string|null} candidateAddressLine
 * @property {string|null} candidateCityLine
 * @property {string} jobTitle
 * @property {string|null} offerExpiry
 * @property {string} employmentTermsText
 * @property {string} hiringManagerName
 * @property {[string, string, boolean][]} detailsRows
 * @property {string[]} benefitBullets
 * @property {string} offerNumber
 * @property {string|null} offerDate
 */

export {};
