import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Role Code', key: 'role_code', width: 20 },
  { header: 'Role Name', key: 'role_name', width: 28 },
  { header: 'Data Type', key: 'data_type_code', width: 16 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Created By', key: 'created_by', width: 18 },
  { header: 'Creation Date', key: 'creation_date', width: 18 },
  { header: 'Positions Count', key: 'positions_count', width: 14 },
  { header: 'Positions', key: 'positions', width: 32 },
  { header: 'Grades Count', key: 'grades_count', width: 12 },
  { header: 'Grades', key: 'grades', width: 24 },
  { header: 'Job Families Count', key: 'job_families_count', width: 16 },
  { header: 'Job Families', key: 'job_families', width: 24 },
  { header: 'Job Levels Count', key: 'job_levels_count', width: 14 },
  { header: 'Job Levels', key: 'job_levels', width: 24 },
  { header: 'Org Units Count', key: 'org_units_count', width: 14 },
  { header: 'Org Units', key: 'org_units', width: 32 },
  { header: 'Data Role GUID', key: 'data_role_guid', width: 36 },
  { header: 'Data Role ID', key: 'data_role_id', width: 14 }
]);

const LABEL_KEYS = [
  'role_code',
  'position_code',
  'grade_number',
  'job_family_code',
  'level_code',
  'org_unit_code',
  'org_unit_name_en',
  'name',
  'code',
  'id',
  'ROLE_CODE',
  'POSITION_CODE',
  'GRADE_NUMBER',
  'JOB_FAMILY_CODE',
  'LEVEL_CODE',
  'ORG_UNIT_CODE'
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

function formatItemLabels(items) {
  if (!Array.isArray(items) || items.length === 0) return '';

  return items
    .map((item) => {
      for (const key of LABEL_KEYS) {
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

function mapDataRoleRow(role) {
  return {
    role_code: role.role_code ?? '',
    role_name: role.role_name ?? '',
    data_type_code: role.data_type_code ?? '',
    status: role.status ?? '',
    description: role.description ?? '',
    created_by: role.created_by ?? '',
    creation_date: formatDate(role.creation_date),
    positions_count: Array.isArray(role.positions) ? role.positions.length : 0,
    positions: formatItemLabels(role.positions),
    grades_count: Array.isArray(role.grades) ? role.grades.length : 0,
    grades: formatItemLabels(role.grades),
    job_families_count: Array.isArray(role.job_families) ? role.job_families.length : 0,
    job_families: formatItemLabels(role.job_families),
    job_levels_count: Array.isArray(role.job_levels) ? role.job_levels.length : 0,
    job_levels: formatItemLabels(role.job_levels),
    org_units_count: Array.isArray(role.org_units) ? role.org_units.length : 0,
    org_units: formatItemLabels(role.org_units),
    data_role_guid: role.data_role_guid ?? '',
    data_role_id: formatNumber(role.data_role_id)
  };
}

/**
 * Build an Excel workbook buffer for data roles export.
 * @param {{ roles: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildDataRolesExcelBuffer({ roles, enterpriseId = null }) {
  const rows = mapToExcelRows(roles, EXPORT_COLUMNS, mapDataRoleRow);

  return buildExcelExport({
    sheets: [{
      name: 'Data Roles',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['data_roles', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
