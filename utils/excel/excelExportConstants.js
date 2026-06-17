export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const DEFAULT_WORKBOOK_CREATOR = 'Digify ERP';

export const MAX_EXCEL_SHEET_NAME_LENGTH = 31;

export const DEFAULT_HEADER_STYLE = Object.freeze({
  font: { bold: true },
  alignment: { vertical: 'middle', horizontal: 'left' },
  fill: {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' }
  },
  border: {
    bottom: { style: 'thin', color: { argb: 'FFB8C4D9' } }
  }
});
