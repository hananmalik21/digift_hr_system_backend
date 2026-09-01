import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '@digifyhr/common/excel';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Employee Number', key: 'employee_number', width: 18 },
  { header: 'Employee Name', key: 'employee_name_en', width: 28 },
  { header: 'Employee ID', key: 'employee_id', width: 12 },
  { header: 'Position', key: 'position_name', width: 24 },
  { header: 'Grade', key: 'grade_name', width: 16 },
  { header: 'Org Structure', key: 'org_structure', width: 36 },
  { header: 'Change Type', key: 'change_type', width: 16 },
  { header: 'Status', key: 'status', width: 14 },
  { header: 'Adjustment Type', key: 'adjustment_type', width: 18 },
  { header: 'Reason Code', key: 'reason_code', width: 16 },
  { header: 'Change Source', key: 'change_source', width: 16 },
  { header: 'Effective Date', key: 'change_effective_date', width: 14 },
  { header: 'Created Date', key: 'change_created_date', width: 18 },
  { header: 'Submission Date', key: 'submission_date', width: 18 },
  { header: 'Currency', key: 'currency_code', width: 10 },
  { header: 'Previous Salary', key: 'previous_salary', width: 16 },
  { header: 'Current Salary', key: 'current_salary', width: 16 },
  { header: 'Impact Amount', key: 'impact_amount', width: 14 },
  { header: 'Impact %', key: 'impact_percent', width: 12 },
  { header: 'Total Earnings', key: 'total_earnings', width: 14 },
  { header: 'Total Allowances', key: 'total_allowances', width: 14 },
  { header: 'Total Benefits', key: 'total_benefits', width: 14 },
  { header: 'Total Bonuses', key: 'total_bonuses', width: 14 },
  { header: 'Total Deductions', key: 'total_deductions', width: 14 },
  { header: 'Component Count', key: 'component_count', width: 14 },
  { header: 'Adjustment ID', key: 'adjustment_id', width: 14 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 }
]);

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

function formatDateTime(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value.slice(0, 19);
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

function mapSalaryChangeHistoryRow(row) {
  return {
    employee_number: row.employee_number ?? '',
    employee_name_en: row.employee_name_en ?? '',
    employee_id: formatNumber(row.employee_id),
    position_name: row.position_name ?? '',
    grade_name: row.grade_name ?? '',
    org_structure: formatOrgStructure(row.org_structure_list),
    change_type: row.change_type ?? '',
    status: row.status ?? '',
    adjustment_type: row.adjustment_type ?? '',
    reason_code: row.reason_code ?? '',
    change_source: row.change_source ?? '',
    change_effective_date: formatDate(row.change_effective_date),
    change_created_date: formatDateTime(row.change_created_date),
    submission_date: formatDateTime(row.submission_date),
    currency_code: row.currency_code ?? '',
    previous_salary: formatNumber(row.previous_salary),
    current_salary: formatNumber(row.current_salary),
    impact_amount: formatNumber(row.impact_amount),
    impact_percent: formatNumber(row.impact_percent),
    total_earnings: formatNumber(row.total_earnings),
    total_allowances: formatNumber(row.total_allowances),
    total_benefits: formatNumber(row.total_benefits),
    total_bonuses: formatNumber(row.total_bonuses),
    total_deductions: formatNumber(row.total_deductions),
    component_count: formatNumber(row.component_count),
    adjustment_id: formatNumber(row.adjustment_id),
    enterprise_id: formatNumber(row.enterprise_id)
  };
}

/**
 * @param {{ rows: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildSalaryChangeHistoryExcelBuffer({ rows, enterpriseId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapSalaryChangeHistoryRow);

  return buildExcelExport({
    sheets: [{
      name: 'Salary Change History',
      columns: EXPORT_COLUMNS,
      rows: excelRows
    }],
    filenameParts: ['salary_change_history', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
