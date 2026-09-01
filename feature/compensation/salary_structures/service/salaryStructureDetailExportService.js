import { buildDynamicApiExcelBuffer } from '@digifyhr/common/excel';

const KEY_ORDER = [
  'structure_id',
  'structure_guid',
  'enterprise_id',
  'structure_code',
  'structure_name',
  'structure_type_code',
  'active_flag',
  'location_obj',
  'structure',
  'advanced_settings',
  'org_scopes',
  'financial_details',
  'grade_ranges',
  'job_families',
  'positions',
  'employment_types',
  'components'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildSalaryStructureDetailsExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Salary Structures',
    filenameParts: ['salary_structures_details', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
