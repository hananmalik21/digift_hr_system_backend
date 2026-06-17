import { buildDynamicApiExcelBuffer } from '../../../../utils/excel/index.js';

const KEY_ORDER = [
  'timesheet_id',
  'timesheet_guid',
  'enterprise_id',
  'employee_id',
  'employee_number',
  'employee_name',
  'week_start_date',
  'week_end_date',
  'status_code',
  'is_active',
  'total_reg_hours',
  'total_ot_hours',
  'submitted_date',
  'approved_date',
  'rejected_date',
  'comments',
  'org_structure_list',
  'timesheet_lines',
  'created_by',
  'creation_date',
  'last_updated_by',
  'last_update_date'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildTimesheetsExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Timesheets',
    filenameParts: ['timesheets', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
