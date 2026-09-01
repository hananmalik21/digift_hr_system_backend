import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Role Code', key: 'role_code', width: 20 },
  { header: 'Role Name', key: 'role_name', width: 28 },
  { header: 'Job Title', key: 'job_title', width: 24 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Duty Roles Count', key: 'duty_roles_count', width: 16 },
  { header: 'Duty Role Codes', key: 'duty_role_codes', width: 32 },
  { header: 'Function Roles Count', key: 'function_roles_count', width: 18 },
  { header: 'Function Role Codes', key: 'function_role_codes', width: 32 },
  { header: 'Data Roles Count', key: 'data_roles_count', width: 16 },
  { header: 'Data Role Codes', key: 'data_role_codes', width: 32 },
  { header: 'Inherited Job Roles Count', key: 'inherited_job_roles_count', width: 22 },
  { header: 'Inherited Job Role Codes', key: 'inherited_job_role_codes', width: 32 },
  { header: 'Inherited From Count', key: 'inherited_from_count', width: 18 },
  { header: 'Inherited From Codes', key: 'inherited_from_codes', width: 32 },
  { header: 'Job Role GUID', key: 'job_role_guid', width: 36 },
  { header: 'Job Role ID', key: 'job_role_id', width: 14 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 }
]);

const ROLE_CODE_KEYS = [
  'role_code',
  'function_role_code',
  'duty_role_code',
  'data_role_code',
  'job_role_code',
  'ROLE_CODE',
  'FUNCTION_ROLE_CODE',
  'DUTY_ROLE_CODE',
  'DATA_ROLE_CODE',
  'JOB_ROLE_CODE'
];

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
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

function mapJobRoleRow(role) {
  return {
    role_code: role.role_code ?? '',
    role_name: role.role_name ?? '',
    job_title: role.job_title ?? '',
    status: role.status ?? '',
    description: role.description ?? '',
    duty_roles_count: Array.isArray(role.duty_roles_json) ? role.duty_roles_json.length : 0,
    duty_role_codes: formatRoleCodes(role.duty_roles_json),
    function_roles_count: Array.isArray(role.function_roles_json) ? role.function_roles_json.length : 0,
    function_role_codes: formatRoleCodes(role.function_roles_json),
    data_roles_count: Array.isArray(role.data_roles_json) ? role.data_roles_json.length : 0,
    data_role_codes: formatRoleCodes(role.data_roles_json),
    inherited_job_roles_count: Array.isArray(role.inherited_job_roles_json) ? role.inherited_job_roles_json.length : 0,
    inherited_job_role_codes: formatRoleCodes(role.inherited_job_roles_json),
    inherited_from_count: Array.isArray(role.inherited_from_json) ? role.inherited_from_json.length : 0,
    inherited_from_codes: formatRoleCodes(role.inherited_from_json),
    job_role_guid: role.job_role_guid ?? '',
    job_role_id: formatNumber(role.job_role_id),
    enterprise_id: formatNumber(role.enterprise_id)
  };
}

/**
 * Build an Excel workbook buffer for job roles export.
 * @param {{ roles: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildJobRolesExcelBuffer({ roles, enterpriseId = null }) {
  const rows = mapToExcelRows(roles, EXPORT_COLUMNS, mapJobRoleRow);

  return buildExcelExport({
    sheets: [{
      name: 'Job Roles',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['job_roles', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
