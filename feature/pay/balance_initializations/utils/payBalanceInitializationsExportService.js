import {
  buildExcelExport,
  defineExcelColumns,
  mapToExcelRows
} from '@digifyhr/common/excel';

export const BALANCE_INITIALIZATIONS_EXPORT_SHEET_NAME = 'Balance Initializations';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Employee', key: 'employee_name', width: 28 },
  { header: 'Employee Email', key: 'employee_email', width: 28 },
  { header: 'Balance Code', key: 'balance_code', width: 18 },
  { header: 'Balance', key: 'balance_name_en', width: 28 },
  { header: 'Dimension', key: 'dimension_name', width: 18 },
  { header: 'Value', key: 'balance_value', width: 14 },
  { header: 'Unit of Measure', key: 'balance_uom_code', width: 14 },
  { header: 'Effective Date', key: 'effective_date_display', width: 16 },
  { header: 'Reason', key: 'reason_name', width: 22 },
  { header: 'Source', key: 'source_type_name', width: 16 },
  { header: 'Status', key: 'status_name', width: 14 },
  { header: 'Comments', key: 'comments', width: 32 },
  { header: 'Error Message', key: 'error_message', width: 36 },
  { header: 'Created By', key: 'created_by', width: 16 },
  { header: 'Creation Date', key: 'creation_date', width: 22 }
]);

function mapExportRow(row) {
  return {
    employee_name: row.employee_name,
    employee_email: row.employee_email,
    balance_code: row.balance_code,
    balance_name_en: row.balance_name_en,
    dimension_name: row.dimension_name,
    balance_value: row.balance_value,
    balance_uom_code: row.balance_uom_code,
    effective_date_display: row.effective_date_display ?? row.effective_date,
    reason_name: row.reason_name,
    source_type_name: row.source_type_name,
    status_name: row.status_name,
    comments: row.comments,
    error_message: row.error_message,
    created_by: row.created_by,
    creation_date: row.creation_date
  };
}

/**
 * @param {{ rows: object[], enterpriseId?: number|null }} args
 */
export async function buildBalanceInitializationsExcelBuffer({ rows, enterpriseId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapExportRow);
  return buildExcelExport({
    sheets: [
      {
        name: BALANCE_INITIALIZATIONS_EXPORT_SHEET_NAME,
        columns: EXPORT_COLUMNS,
        rows: excelRows
      }
    ],
    filenameParts: [
      'pay_balance_initializations',
      enterpriseId ? `enterprise_${enterpriseId}` : null
    ],
    freezeHeader: true,
    autoFilter: true
  });
}
