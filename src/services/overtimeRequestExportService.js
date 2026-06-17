import { buildDynamicApiExcelBuffer } from '../../utils/excel/index.js';

const KEY_ORDER = [
  'ot_request_id',
  'ot_request_guid',
  'enterprise_id',
  'tenant_id',
  'employee_id',
  'employee_guid',
  'employee_number',
  'employee_name_en',
  'attendance_day_id',
  'attendance_date',
  'requested_hours',
  'approved_hours',
  'status',
  'reason',
  'ot_config_id',
  'ot_rate_type_id',
  'ot_config_obj',
  'ot_rate_type_obj',
  'org_structure_list',
  'manager_approved_by',
  'manager_approved_date',
  'hr_validated_by',
  'hr_validated_date',
  'created_by',
  'creation_date',
  'last_updated_by',
  'last_update_date'
];

/** @param {{ rows: object[], tenantId?: number|string|null }} params */
export function buildOvertimeRequestsExcelBuffer({ rows, tenantId = null }) {
  return buildDynamicApiExcelBuffer({
    rows,
    sheetName: 'Overtime Requests',
    filenameParts: ['overtime_requests', tenantId ? `tenant_${tenantId}` : null],
    keyOrder: KEY_ORDER
  });
}
