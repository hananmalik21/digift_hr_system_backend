import { buildDynamicApiExcelBuffer } from '@digifyhr/common/excel';
import {
  CANDIDATE_DEMOGRAPHIC_API_FIELDS,
  CANDIDATE_JSON_COLLECTION_API_FIELDS
} from '../utils/recCandidateProfileFields.js';

const KEY_ORDER = [
  'candidate_id',
  'candidate_guid',
  'enterprise_id',
  'first_name',
  'middle_name',
  'last_name',
  'full_name',
  'email',
  'phone',
  'current_title',
  'current_employer',
  'years_experience',
  'current_location',
  'source',
  'expected_salary',
  'current_salary',
  'salary_currency',
  'notice_period',
  'linkedin_profile',
  'portfolio_link',
  'github_link',
  'willing_to_relocate',
  ...CANDIDATE_DEMOGRAPHIC_API_FIELDS,
  ...CANDIDATE_JSON_COLLECTION_API_FIELDS,
  'status',
  'active_flag',
  'created_by',
  'creation_date',
  'last_updated_by',
  'last_update_date'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildCandidatesExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Candidates',
    filenameParts: ['candidates', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
