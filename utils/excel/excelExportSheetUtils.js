import { MAX_EXCEL_SHEET_NAME_LENGTH } from './excelExportConstants.js';

/**
 * Sanitize a worksheet name for Excel.
 * @param {string} name
 * @param {string} [fallback='Sheet']
 * @returns {string}
 */
export function sanitizeExcelSheetName(name, fallback = 'Sheet') {
  return String(name ?? fallback)
    .replace(/[\\/*?:[\]]/g, ' ')
    .trim()
    .slice(0, MAX_EXCEL_SHEET_NAME_LENGTH) || fallback;
}

/**
 * Ensure worksheet names are unique within a workbook.
 * @param {import('./excelExportTypes.js').ExcelSheetDef[]} sheets
 * @returns {import('./excelExportTypes.js').ExcelSheetDef[]}
 */
export function ensureUniqueSheetNames(sheets) {
  const usedCounts = new Map();

  return sheets.map((sheet) => {
    const baseName = sanitizeExcelSheetName(sheet.name);
    const count = usedCounts.get(baseName) ?? 0;
    usedCounts.set(baseName, count + 1);

    if (count === 0) {
      return { ...sheet, name: baseName };
    }

    const suffix = ` (${count})`;
    const trimmedBase = baseName.slice(0, MAX_EXCEL_SHEET_NAME_LENGTH - suffix.length);
    return { ...sheet, name: `${trimmedBase}${suffix}` };
  });
}
