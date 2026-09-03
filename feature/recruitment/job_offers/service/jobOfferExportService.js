import { buildDynamicApiExcelBuffer } from '@digifyhr/common/excel';

const KEY_ORDER = [
  'offer_id',
  'offer_guid',
  'enterprise_id',
  'application_id',
  'resume_url',
  'candidate_guid',
  'posting_id',
  'offer_number',
  'posting_guid',
  'posting_title',
  'job_title',
  'location',
  'work_mode_code',
  'employment_type_code',
  'start_date',
  'offer_date',
  'expiry_date',
  'approval_status',
  'display_status',
  'stage',
  'status_code',
  'stage_description',
  'annual_salary',
  'candidate_obj',
  'posting_obj',
  'position_obj',
  'department_obj',
  'grade_obj',
  'components_json',
  'benefits_json',
  'terms_json',
  'comments',
  'decline_comments',
  'created_by',
  'creation_date',
  'last_updated_by',
  'last_update_date'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildJobOffersExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Job Offers',
    filenameParts: ['job_offers', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
