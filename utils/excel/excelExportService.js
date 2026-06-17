import ExcelJS from 'exceljs';
import {
  DEFAULT_HEADER_STYLE,
  DEFAULT_WORKBOOK_CREATOR,
  XLSX_MIME_TYPE
} from './excelExportConstants.js';
import { buildExcelFilename, rowValuesForColumns } from './excelExportHelpers.js';
import { ensureUniqueSheetNames } from './excelExportSheetUtils.js';
import { validateWorkbookSheets } from './excelExportValidation.js';

/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {typeof DEFAULT_HEADER_STYLE} [headerStyle]
 */
function styleHeaderRow(worksheet, headerStyle = DEFAULT_HEADER_STYLE) {
  const headerRow = worksheet.getRow(1);
  if (headerStyle.font) headerRow.font = headerStyle.font;
  if (headerStyle.alignment) headerRow.alignment = headerStyle.alignment;

  headerRow.eachCell((cell) => {
    if (headerStyle.fill) {
      cell.fill = headerStyle.fill;
    }
    if (headerStyle.border) {
      cell.border = headerStyle.border;
    }
  });
}

/**
 * @param {import('exceljs').Worksheet} worksheet
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @param {{ freezeHeader?: boolean, autoFilter?: boolean }} [options]
 */
function applySheetPresentation(worksheet, columns, options = {}) {
  const columnCount = columns.length;
  if (columnCount === 0) return;

  if (options.freezeHeader) {
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  }

  if (options.autoFilter) {
    const lastColumnLetter = worksheet.getColumn(columnCount).letter;
    worksheet.autoFilter = `A1:${lastColumnLetter}1`;
  }
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {import('./excelExportTypes.js').ExcelSheetDef} sheet
 * @param {{
 *   styleHeader?: boolean,
 *   headerStyle?: typeof DEFAULT_HEADER_STYLE,
 *   freezeHeader?: boolean,
 *   autoFilter?: boolean
 * }} [options]
 */
function addSheet(workbook, sheet, options = {}) {
  const {
    styleHeader = true,
    headerStyle = DEFAULT_HEADER_STYLE,
    freezeHeader = false,
    autoFilter = false
  } = options;

  const worksheet = workbook.addWorksheet(sheet.name);
  worksheet.columns = sheet.columns;

  if (styleHeader) {
    styleHeaderRow(worksheet, headerStyle);
  }

  applySheetPresentation(worksheet, sheet.columns, { freezeHeader, autoFilter });

  for (const row of sheet.rows) {
    worksheet.addRow(rowValuesForColumns(row, sheet.columns));
  }

  return worksheet;
}

/**
 * Build an Excel workbook buffer from one or more sheet definitions.
 * @param {import('./excelExportTypes.js').BuildExcelBufferOptions} params
 * @returns {Promise<{ buffer: Buffer, rowCount: number }>}
 */
export async function buildExcelBuffer({
  sheets,
  creator = DEFAULT_WORKBOOK_CREATOR,
  styleHeader = true,
  headerStyle = DEFAULT_HEADER_STYLE,
  freezeHeader = false,
  autoFilter = false
}) {
  validateWorkbookSheets(sheets);

  const normalizedSheets = ensureUniqueSheetNames(sheets);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = creator;
  workbook.created = new Date();

  let rowCount = 0;
  for (const sheet of normalizedSheets) {
    addSheet(workbook, sheet, { styleHeader, headerStyle, freezeHeader, autoFilter });
    rowCount += sheet.rows.length;
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return { buffer, rowCount };
}

/**
 * Build an Excel export buffer and filename in one call.
 * @param {import('./excelExportTypes.js').BuildExcelExportOptions} params
 * @returns {Promise<{ buffer: Buffer, filename: string, rowCount: number }>}
 */
export async function buildExcelExport({
  sheets,
  filenameParts,
  filenameOptions,
  ...buildOptions
}) {
  const { buffer, rowCount } = await buildExcelBuffer({ sheets, ...buildOptions });
  const filename = buildExcelFilename(filenameParts ?? ['export'], filenameOptions);

  return { buffer, filename, rowCount };
}

/**
 * Stream an Excel file download via Express.
 * @param {import('express').Response} res
 * @param {Buffer} buffer
 * @param {string} filename
 */
export function sendExcelExport(res, buffer, filename) {
  const encodedFilename = encodeURIComponent(filename);

  res.setHeader('Content-Type', XLSX_MIME_TYPE);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`
  );
  res.setHeader('Content-Length', String(buffer.length));
  res.setHeader('Cache-Control', 'private, no-store');
  return res.send(buffer);
}
