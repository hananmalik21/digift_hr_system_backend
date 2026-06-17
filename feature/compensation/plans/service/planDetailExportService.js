import { buildDynamicApiExcelBuffer } from '../../../../utils/excel/index.js';

const KEY_ORDER = [
  'plan_id',
  'plan_guid',
  'enterprise_id',
  'plan_code',
  'plan_name',
  'plan_type_code',
  'status_code',
  'currency_code',
  'active_flag',
  'owner_employee_id',
  'created_by',
  'creation_date',
  'last_updated_by',
  'last_update_date',
  'owner_obj',
  'plan_attributes_json',
  'plan_budgets_json',
  'plan_business_units_json',
  'plan_components_json',
  'plan_employment_types_json',
  'plan_grades_json',
  'plan_job_families_json',
  'plan_locations_json',
  'plan_positions_json',
  'plan_salary_structures_json'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildPlanDetailsExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Plan Details',
    filenameParts: ['comp_plans_details', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
