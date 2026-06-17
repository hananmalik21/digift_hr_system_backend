import { buildDynamicApiExcelBuffer } from '../../../../utils/excel/index.js';

const KEY_ORDER = [
  'attendance_day_id',
  'enterprise_id',
  'employee_id',
  'employee_number',
  'employee_name',
  'attendance_date',
  'attendance_status',
  'day_category',
  'in_state',
  'out_state',
  'source_type',
  'schedule_obj',
  'actual_obj',
  'org_structure_list',
  'org_structure_list_json'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildAttendanceLogsExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Attendance Logs',
    filenameParts: ['attendance_logs', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
