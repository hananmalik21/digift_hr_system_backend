import {
  buildExcelExport,
  defineExcelColumns,
  formatYnActiveFlag,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Employee Number', key: 'employee_number', width: 18 },
  { header: 'First Name (EN)', key: 'first_name_en', width: 18 },
  { header: 'Middle Name (EN)', key: 'middle_name_en', width: 18 },
  { header: 'Last Name (EN)', key: 'last_name_en', width: 18 },
  { header: 'Fourth Name (EN)', key: 'fourth_name_en', width: 18 },
  { header: 'First Name (AR)', key: 'first_name_ar', width: 18 },
  { header: 'Middle Name (AR)', key: 'middle_name_ar', width: 18 },
  { header: 'Last Name (AR)', key: 'last_name_ar', width: 18 },
  { header: 'Fourth Name (AR)', key: 'fourth_name_ar', width: 18 },
  { header: 'Family Name (AR)', key: 'family_name_ar', width: 18 },
  { header: 'Email', key: 'email', width: 28 },
  { header: 'Phone', key: 'phone_number', width: 16 },
  { header: 'Mobile', key: 'mobile_number', width: 16 },
  { header: 'Date of Birth', key: 'date_of_birth', width: 14 },
  { header: 'Employee Status', key: 'employee_status', width: 16 },
  { header: 'Employee Active', key: 'employee_is_active', width: 14 },
  { header: 'Position Code', key: 'position_code', width: 16 },
  { header: 'Position Title (EN)', key: 'position_title_en', width: 24 },
  { header: 'Org Structure', key: 'org_structure', width: 36 },
  { header: 'Employment Status', key: 'employment_status', width: 18 },
  { header: 'Assignment Status', key: 'assignment_status', width: 18 },
  { header: 'Assignment Active', key: 'assignment_is_active', width: 16 },
  { header: 'Contract Type', key: 'contract_type_code', width: 16 },
  { header: 'Enterprise Hire Date', key: 'enterprise_hire_date', width: 18 },
  { header: 'Effective Start', key: 'effective_start_date', width: 16 },
  { header: 'Effective End', key: 'effective_end_date', width: 16 },
  { header: 'Job Family ID', key: 'job_family_id', width: 14 },
  { header: 'Job Level ID', key: 'job_level_id', width: 14 },
  { header: 'Grade ID', key: 'grade_id', width: 10 }
]);

function formatDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'string') return value.slice(0, 10);
  return String(value);
}

function formatOrgStructure(orgStructureList) {
  if (!Array.isArray(orgStructureList) || orgStructureList.length === 0) return '';

  return orgStructureList.map((item) => {
    const level = item?.level_code ?? item?.LEVEL_CODE ?? '';
    const name = item?.org_unit_name_en
      ?? item?.ORG_UNIT_NAME_EN
      ?? item?.org_unit_name_ar
      ?? item?.ORG_UNIT_NAME_AR
      ?? '';
    return level ? `${level}: ${name}` : name;
  }).join(' > ');
}

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function mapEmployeeRow(employee) {
  return {
    employee_number: employee.employee_number ?? '',
    first_name_en: employee.first_name_en ?? '',
    middle_name_en: employee.middle_name_en ?? '',
    last_name_en: employee.last_name_en ?? '',
    fourth_name_en: employee.fourth_name_en ?? '',
    first_name_ar: employee.first_name_ar ?? '',
    middle_name_ar: employee.middle_name_ar ?? '',
    last_name_ar: employee.last_name_ar ?? '',
    fourth_name_ar: employee.fourth_name_ar ?? '',
    family_name_ar: employee.family_name_ar ?? '',
    email: employee.email ?? '',
    phone_number: employee.phone_number ?? '',
    mobile_number: employee.mobile_number ?? '',
    date_of_birth: formatDate(employee.date_of_birth),
    employee_status: employee.employee_status ?? '',
    employee_is_active: formatYnActiveFlag(employee.employee_is_active),
    position_code: employee.position?.position_code ?? '',
    position_title_en: employee.position?.position_title_en ?? '',
    org_structure: formatOrgStructure(employee.org_structure_list),
    employment_status: employee.employment_status ?? '',
    assignment_status: employee.assignment_status ?? '',
    assignment_is_active: formatYnActiveFlag(employee.assignment_is_active),
    contract_type_code: employee.contract_type_code ?? '',
    enterprise_hire_date: formatDate(employee.enterprise_hire_date),
    effective_start_date: formatDate(employee.effective_start_date),
    effective_end_date: formatDate(employee.effective_end_date),
    job_family_id: formatNumber(employee.job_family_id),
    job_level_id: formatNumber(employee.job_level_id),
    grade_id: formatNumber(employee.grade_id)
  };
}

/**
 * Build an Excel workbook buffer for employee export.
 * @param {{ employees: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildEmployeesExcelBuffer({ employees, enterpriseId = null }) {
  const rows = mapToExcelRows(employees, EXPORT_COLUMNS, mapEmployeeRow);

  return buildExcelExport({
    sheets: [{
      name: 'Employees',
      columns: EXPORT_COLUMNS,
      rows
    }],
    filenameParts: ['employees', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
