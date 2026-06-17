/**
 * Thrown when Excel export input or configuration is invalid.
 */
export class ExcelExportError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, details?: unknown }} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'ExcelExportError';
    this.code = options.code ?? 'EXCEL_EXPORT_ERROR';
    this.details = options.details;
  }
}
