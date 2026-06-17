/**
 * @typedef {{ header: string, key: string, width?: number }} ExcelColumnDef
 */

/**
 * @typedef {{
 *   name: string,
 *   columns: ExcelColumnDef[],
 *   rows: Record<string, unknown>[]
 * }} ExcelSheetDef
 */

/**
 * @typedef {{
 *   sheets: ExcelSheetDef[],
 *   creator?: string,
 *   styleHeader?: boolean,
 *   headerStyle?: typeof import('./excelExportConstants.js').DEFAULT_HEADER_STYLE,
 *   freezeHeader?: boolean,
 *   autoFilter?: boolean
 * }} BuildExcelBufferOptions
 */

/**
 * @typedef {BuildExcelBufferOptions & {
 *   filenameParts?: Array<string|number|null|undefined>,
 *   filenameOptions?: import('./excelExportHelpers.js').BuildExcelFilenameOptions
 * }} BuildExcelExportOptions
 */

export {};
