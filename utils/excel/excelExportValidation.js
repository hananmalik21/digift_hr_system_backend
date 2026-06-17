import { ExcelExportError } from './excelExportErrors.js';

/**
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @param {string} [context]
 */
export function assertUniqueColumnKeys(columns, context = 'sheet') {
  const seen = new Set();

  for (const column of columns ?? []) {
    const key = column?.key;
    if (!key || typeof key !== 'string') {
      throw new ExcelExportError(`${context} columns must each have a string key`, {
        code: 'INVALID_COLUMN_KEY',
        details: { column }
      });
    }
    if (seen.has(key)) {
      throw new ExcelExportError(`Duplicate Excel column key "${key}" in ${context}`, {
        code: 'DUPLICATE_COLUMN_KEY',
        details: { key, context }
      });
    }
    seen.add(key);
  }
}

/**
 * @param {import('./excelExportTypes.js').ExcelSheetDef} sheet
 * @param {number} index
 */
export function validateSheetDef(sheet, index) {
  const label = sheet?.name ?? `index ${index}`;

  if (!sheet || typeof sheet !== 'object') {
    throw new ExcelExportError(`Sheet at index ${index} must be an object`, {
      code: 'INVALID_SHEET'
    });
  }

  if (!sheet.name || !String(sheet.name).trim()) {
    throw new ExcelExportError(`Sheet at index ${index} must have a name`, {
      code: 'MISSING_SHEET_NAME'
    });
  }

  if (!Array.isArray(sheet.columns) || sheet.columns.length === 0) {
    throw new ExcelExportError(`Sheet "${label}" must define at least one column`, {
      code: 'MISSING_COLUMNS'
    });
  }

  if (!Array.isArray(sheet.rows)) {
    throw new ExcelExportError(`Sheet "${label}" rows must be an array`, {
      code: 'INVALID_ROWS'
    });
  }

  assertUniqueColumnKeys(sheet.columns, `sheet "${label}"`);
}

/**
 * @param {import('./excelExportTypes.js').ExcelSheetDef[]} sheets
 */
export function validateWorkbookSheets(sheets) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new ExcelExportError('At least one sheet is required to build an Excel export', {
      code: 'MISSING_SHEETS'
    });
  }

  sheets.forEach((sheet, index) => validateSheetDef(sheet, index));
}
