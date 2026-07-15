import {
  buildExcelExport,
  defineExcelColumns,
  formatJsonExportValue,
  mapToExcelRows
} from '../../../../utils/excel/index.js';

export const ELEMENT_ENTRIES_EXPORT_SHEET_NAME = 'Element Entries';
export const ELEMENT_ENTRIES_EXPORT_EMPTY_MESSAGE = 'No element entries found to export';

const EXPORT_COLUMNS = defineExcelColumns([
  { header: 'Element Entry ID', key: 'element_entry_id', width: 16 },
  { header: 'Element Entry GUID', key: 'element_entry_guid', width: 36 },
  { header: 'Enterprise ID', key: 'enterprise_id', width: 14 },
  { header: 'Employee ID', key: 'employee_id', width: 12 },
  { header: 'Employee Number', key: 'employee_number', width: 16 },
  { header: 'Employee First Name', key: 'employee_first_name', width: 18 },
  { header: 'Employee Last Name', key: 'employee_last_name', width: 18 },
  { header: 'Payroll ID', key: 'payroll_id', width: 12 },
  { header: 'Element ID', key: 'element_id', width: 12 },
  { header: 'Element Code', key: 'element_code', width: 18 },
  { header: 'Element Name', key: 'element_name', width: 28 },
  { header: 'Pay Value', key: 'pay_value', width: 12 },
  { header: 'Amount', key: 'amount', width: 12 },
  { header: 'Currency', key: 'currency_code', width: 10 },
  { header: 'Source', key: 'source_code', width: 16 },
  { header: 'Classification', key: 'element_classification_code', width: 20 },
  { header: 'Status', key: 'approval_status_code', width: 14 },
  { header: 'Effective As Of', key: 'effective_as_of_date', width: 14 },
  { header: 'Effective Start', key: 'effective_start_date', width: 14 },
  { header: 'Effective End', key: 'effective_end_date', width: 14 },
  { header: 'Entry Type', key: 'entry_type_code', width: 16 },
  { header: 'Processing Type', key: 'element_processing_type_code', width: 16 },
  { header: 'Processed', key: 'processed_flag', width: 10 },
  { header: 'Retroactive', key: 'retroactive_flag', width: 12 },
  { header: 'Automatic Entry', key: 'automatic_entry_flag', width: 14 },
  { header: 'Sequence', key: 'sequence_number', width: 10 },
  { header: 'Reason', key: 'reason_text', width: 28 },
  { header: 'Comments', key: 'comments', width: 28 },
  { header: 'Entry Values', key: 'entry_values', width: 40 },
  { header: 'Costing Values', key: 'costing_values', width: 40 },
  { header: 'Context Values', key: 'context_values', width: 40 },
  { header: 'Created By', key: 'created_by', width: 18 },
  { header: 'Creation Date', key: 'creation_date', width: 20 },
  { header: 'Last Updated By', key: 'last_updated_by', width: 18 },
  { header: 'Last Update Date', key: 'last_update_date', width: 20 }
]);

function mapElementEntryRow(row) {
  const employee = row?.employee_information ?? {};
  const element = row?.element_information ?? {};

  return {
    element_entry_id: row.element_entry_id,
    element_entry_guid: row.element_entry_guid,
    enterprise_id: row.enterprise_id,
    employee_id: row.employee_id ?? employee.employee_id,
    employee_number: employee.employee_number,
    employee_first_name: employee.first_name,
    employee_last_name: employee.last_name,
    payroll_id: row.payroll_id,
    element_id: row.element_id ?? element.element_id,
    element_code: element.element_code,
    element_name: element.element_name,
    pay_value: row.pay_value,
    amount: row.amount,
    currency_code: row.currency_code,
    source_code: row.source_code,
    element_classification_code: row.element_classification_code,
    approval_status_code: row.approval_status_code,
    effective_as_of_date: row.effective_as_of_date,
    effective_start_date: row.effective_start_date,
    effective_end_date: row.effective_end_date,
    entry_type_code: row.entry_type_code,
    element_processing_type_code: row.element_processing_type_code,
    processed_flag: row.processed_flag,
    retroactive_flag: row.retroactive_flag,
    automatic_entry_flag: row.automatic_entry_flag,
    sequence_number: row.sequence_number,
    reason_text: row.reason_text,
    comments: row.comments,
    entry_values: formatJsonExportValue(row.entry_values),
    costing_values: formatJsonExportValue(row.costing_values),
    context_values: formatJsonExportValue(row.context_values),
    created_by: row.created_by,
    creation_date: row.creation_date,
    last_updated_by: row.last_updated_by,
    last_update_date: row.last_update_date
  };
}

/**
 * Build an Excel workbook buffer for payroll element entries export.
 * @param {{ rows: object[], enterpriseId?: number|string|null }} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildElementEntriesExcelBuffer({ rows, enterpriseId = null }) {
  const excelRows = mapToExcelRows(rows, EXPORT_COLUMNS, mapElementEntryRow);

  return buildExcelExport({
    sheets: [{
      name: ELEMENT_ENTRIES_EXPORT_SHEET_NAME,
      columns: EXPORT_COLUMNS,
      rows: excelRows
    }],
    filenameParts: ['pay_element_entries', enterpriseId ? `enterprise_${enterpriseId}` : null],
    freezeHeader: true,
    autoFilter: true
  });
}
