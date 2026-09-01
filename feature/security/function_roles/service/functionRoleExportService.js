import {
  buildExcelExport,
  defineExcelColumns,
  formatYnActiveFlag,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Role Code', key: 'role_code', width: 20 },
  { header: 'Role Name', key: 'role_name', width: 28 },
  { header: 'Module Code', key: 'module_code', width: 18 },
  { header: 'Module Name', key: 'module_name', width: 24 },
  { header: 'Status', key: 'status_code', width: 14 },
  { header: 'Active', key: 'active_flag', width: 10 },
  { header: 'Display Order', key: 'display_order', width: 14 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Functions Count', key: 'functions_count', width: 14 },
  { header: 'Function Codes', key: 'function_codes', width: 32 },
  { header: 'Function Role GUID', key: 'function_role_guid', width: 36 },
  { header: 'Function Role ID', key: 'function_role_id', width: 16 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 },
  { header: 'Module ID', key: 'module_id', width: 12 }
]);

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function formatFunctionCodes(functions) {
  if (!Array.isArray(functions) || functions.length === 0) return '';
  return functions
    .map((item) => item?.function_code ?? item?.FUNCTION_CODE ?? '')
    .filter(Boolean)
    .join(', ');
}

function mapFunctionRoleRow(role) {
  return {
    role_code: role.role_code ?? '',
    role_name: role.role_name ?? '',
    module_code: role.module_code ?? '',
    module_name: role.module_name ?? '',
    status_code: role.status_code ?? '',
    active_flag: formatYnActiveFlag(role.active_flag),
    display_order: formatNumber(role.display_order),
    description: role.description ?? '',
    functions_count: Array.isArray(role.functions) ? role.functions.length : 0,
    function_codes: formatFunctionCodes(role.functions),
    function_role_guid: role.function_role_guid ?? '',
    function_role_id: formatNumber(role.function_role_id),
    enterprise_id: formatNumber(role.enterprise_id),
    module_id: formatNumber(role.module_id)
  };
}

/**
 * Build an Excel workbook buffer for function roles export.
 * @param {{ roles: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildFunctionRolesExcelBuffer({ roles, enterpriseId = null }) {
  const rows = mapToExcelRows(roles, EXPORT_COLUMNS, mapFunctionRoleRow);

  return buildExcelExport({
    sheets: [{
      name: 'Function Roles',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['function_roles', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
