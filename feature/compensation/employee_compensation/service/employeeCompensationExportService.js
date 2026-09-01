import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Employee Number', key: 'employee_number', width: 18 },
  { header: 'Employee Name', key: 'employee_name', width: 28 },
  { header: 'Employee ID', key: 'employee_id', width: 12 },
  { header: 'Position', key: 'position_name', width: 24 },
  { header: 'Grade', key: 'grade_number', width: 10 },
  { header: 'Grade Category', key: 'grade_category', width: 16 },
  { header: 'Org Structure', key: 'org_structure', width: 36 },
  { header: 'Plan Code', key: 'plan_code', width: 18 },
  { header: 'Plan Name', key: 'plan_name', width: 24 },
  { header: 'Plan Status', key: 'status_code', width: 14 },
  { header: 'Structure Code', key: 'structure_code', width: 18 },
  { header: 'Structure Name', key: 'structure_name', width: 24 },
  { header: 'Total Compensation', key: 'total_compensation', width: 18 },
  { header: 'Total Retro', key: 'total_retro_amount', width: 14 },
  { header: 'Total Base Salary', key: 'total_base_salary', width: 16 },
  { header: 'Total Allowance', key: 'total_allowance', width: 16 },
  { header: 'Total Benefits', key: 'total_benefits', width: 14 },
  { header: 'Employee GUID', key: 'employee_guid', width: 36 },
  { header: 'Plan GUID', key: 'plan_guid', width: 36 },
  { header: 'Plan ID', key: 'plan_id', width: 12 },
  { header: 'Structure ID', key: 'structure_id', width: 12 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 }
]);

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
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

function mapEmployeeCompensationRow(row) {
  return {
    employee_number: row.employee_number ?? '',
    employee_name: row.employee_name ?? '',
    employee_id: formatNumber(row.employee_id),
    position_name: row.position_name ?? '',
    grade_number: formatNumber(row.grade_number),
    grade_category: row.grade_category ?? '',
    org_structure: formatOrgStructure(row.org_structure_list),
    plan_code: row.plan_code ?? '',
    plan_name: row.plan_name ?? '',
    status_code: row.status_code ?? '',
    structure_code: row.structure_code ?? '',
    structure_name: row.structure_name ?? '',
    total_compensation: formatNumber(row.total_compensation),
    total_retro_amount: formatNumber(row.total_retro_amount),
    total_base_salary: formatNumber(row.total_base_salary),
    total_allowance: formatNumber(row.total_allowance),
    total_benefits: formatNumber(row.total_benefits),
    employee_guid: row.employee_guid ?? '',
    plan_guid: row.plan_guid ?? '',
    plan_id: formatNumber(row.plan_id),
    structure_id: formatNumber(row.structure_id),
    enterprise_id: formatNumber(row.enterprise_id)
  };
}

/**
 * @param {{ rows: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildEmployeeCompensationExcelBuffer({ rows, enterpriseId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapEmployeeCompensationRow);

  return buildExcelExport({
    sheets: [{
      name: 'Employee Compensation',
      columns: EXPORT_COLUMNS,
      rows: excelRows
    }],
    filenameParts: ['employee_compensation', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
