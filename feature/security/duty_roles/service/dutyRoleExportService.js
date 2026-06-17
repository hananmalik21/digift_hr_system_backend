import {
  buildExcelExport,
  defineExcelColumns,
  formatYnActiveFlag,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Duty Role Code', key: 'duty_role_code', width: 20 },
  { header: 'Duty Role Name', key: 'duty_role_name', width: 28 },
  { header: 'Category', key: 'category_code', width: 16 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Active', key: 'active_flag', width: 10 },
  { header: 'Requires Manager Approval', key: 'requires_manager_approval', width: 22 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Effective Date', key: 'effective_date', width: 16 },
  { header: 'Expiration Date', key: 'expiration_date', width: 16 },
  { header: 'Direct Function Roles Count', key: 'direct_function_roles_count', width: 22 },
  { header: 'Direct Function Role Codes', key: 'direct_function_role_codes', width: 32 },
  { header: 'Inherited Duty Roles Count', key: 'inherited_duty_roles_count', width: 22 },
  { header: 'Inherited Duty Role Codes', key: 'inherited_duty_role_codes', width: 32 },
  { header: 'Effective Function Roles Count', key: 'effective_function_roles_count', width: 24 },
  { header: 'Effective Function Role Codes', key: 'effective_function_role_codes', width: 32 },
  { header: 'Duty Role GUID', key: 'duty_role_guid', width: 36 },
  { header: 'Duty Role ID', key: 'duty_role_id', width: 14 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 }
]);

const ROLE_CODE_KEYS = [
  'role_code',
  'function_role_code',
  'duty_role_code',
  'ROLE_CODE',
  'FUNCTION_ROLE_CODE',
  'DUTY_ROLE_CODE'
];

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function formatDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value);
}

function formatRoleCodes(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items
    .map((item) => {
      for (const key of ROLE_CODE_KEYS) {
        const value = item?.[key];
        if (value != null && String(value).trim() !== '') {
          return String(value).trim();
        }
      }
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

function mapDutyRoleRow(role) {
  return {
    duty_role_code: role.duty_role_code ?? '',
    duty_role_name: role.duty_role_name ?? '',
    category_code: role.category_code ?? '',
    status: role.status ?? '',
    active_flag: formatYnActiveFlag(role.active_flag),
    requires_manager_approval: formatYnActiveFlag(role.requires_manager_approval),
    description: role.description ?? '',
    effective_date: formatDate(role.effective_date),
    expiration_date: formatDate(role.expiration_date),
    direct_function_roles_count: Array.isArray(role.direct_function_roles) ? role.direct_function_roles.length : 0,
    direct_function_role_codes: formatRoleCodes(role.direct_function_roles),
    inherited_duty_roles_count: Array.isArray(role.inherited_duty_roles) ? role.inherited_duty_roles.length : 0,
    inherited_duty_role_codes: formatRoleCodes(role.inherited_duty_roles),
    effective_function_roles_count: Array.isArray(role.effective_function_roles) ? role.effective_function_roles.length : 0,
    effective_function_role_codes: formatRoleCodes(role.effective_function_roles),
    duty_role_guid: role.duty_role_guid ?? '',
    duty_role_id: formatNumber(role.duty_role_id),
    enterprise_id: formatNumber(role.enterprise_id)
  };
}

/**
 * Build an Excel workbook buffer for duty roles export.
 * @param {{ roles: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildDutyRolesExcelBuffer({ roles, enterpriseId = null }) {
  const rows = mapToExcelRows(roles, EXPORT_COLUMNS, mapDutyRoleRow);

  return buildExcelExport({
    sheets: [{
      name: 'Duty Roles',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['duty_roles', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
