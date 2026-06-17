/**
 * Backward-compatible barrel for Excel export utilities.
 * Prefer importing from `utils/excel/index.js` in new code.
 */
export {
  XLSX_MIME_TYPE,
  DEFAULT_WORKBOOK_CREATOR,
  MAX_EXCEL_SHEET_NAME_LENGTH,
  DEFAULT_HEADER_STYLE,
  ExcelExportError,
  assertUniqueColumnKeys,
  validateSheetDef,
  validateWorkbookSheets,
  sanitizeExcelSheetName,
  ensureUniqueSheetNames,
  slugifyFilenamePart,
  buildExcelFilename,
  defineExcelColumns,
  rowValuesForColumns,
  mapToExcelRows,
  excludeExcelColumns,
  omitRowKeys,
  formatYnActiveFlag,
  buildExcelBuffer,
  buildExcelExport,
  sendExcelExport,
  DEFAULT_EXPORT_PAGE_SIZE,
  DEFAULT_EXPORT_MAX_ROWS,
  paginateForExport,
  formatJsonExportValue,
  headerFromExportKey,
  exportColumnWidthForKey,
  collectExportKeys,
  buildDynamicExportColumns,
  mapApiRowForExcel,
  buildDynamicApiExcelBuffer
} from './excel/index.js';

// Legacy alias used by earlier exports.
export { XLSX_MIME_TYPE as XLSX_MIME } from './excel/index.js';
