import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Employee Number', key: 'employee_number', width: 18 },
  { header: 'Employee Name', key: 'employee_name', width: 28 },
  { header: 'Employee ID', key: 'employee_id', width: 12 },
  { header: 'Annual Leave', key: 'annual_leave', width: 14 },
  { header: 'Sick Leave', key: 'sick_leave', width: 14 },
  { header: 'Total Available', key: 'total_available', width: 16 }
]);

function formatNumber(value) {
  if (value === undefined || value === null || value === '') return '';
  const number = Number(value);
  return Number.isFinite(number) ? number : '';
}

function mapLeaveBalanceRow(row) {
  return {
    employee_number: row.employee_number ?? '',
    employee_name: row.employee_name ?? '',
    employee_id: formatNumber(row.employee_id),
    annual_leave: formatNumber(row.annual_leave),
    sick_leave: formatNumber(row.sick_leave),
    total_available: formatNumber(row.total_available)
  };
}

/**
 * Build an Excel workbook buffer for leave balance summary export.
 * @param {{ rows: object[], tenantId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildLeaveBalancesExcelBuffer({ rows, tenantId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapLeaveBalanceRow);

  return buildExcelExport({
    sheets: [{
      name: 'Leave Balances',
      columns: EXPORT_COLUMNS,
      rows: excelRows
    }],
    filenameParts: ['leave_balances', tenantId ? `tenant_${tenantId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
