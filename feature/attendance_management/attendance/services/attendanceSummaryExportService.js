import { buildDynamicApiExcelBuffer } from '@digifyhr/common/excel';

const KEY_ORDER = [
  'enterprise_id',
  'employee_id',
  'employee_number',
  'employee_name',
  'attendance_date',
  'attendance_status',
  'org_structure_list',
  'scheduled_hours',
  'actual_hours',
  'regular_hours',
  'overtime_hours',
  'late_minutes',
  'early_leave_minutes',
  'absence_hours'
];

/** @param {{ rows: object[], enterpriseId?: number|string|null }} params */
export function buildAttendanceSummaryExcelBuffer({ rows, enterpriseId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Attendance Summary',
    filenameParts: ['attendance_summary', enterpriseId ? `enterprise_${enterpriseId}` : null],
    keyOrder: KEY_ORDER
  });
}
