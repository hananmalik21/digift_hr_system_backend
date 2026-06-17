import { assertUniqueColumnKeys } from './excelExportValidation.js';

/**
 * @typedef {{
 *   extension?: string,
 *   includeDate?: boolean,
 *   maxPartLength?: number
 * }} BuildExcelFilenameOptions
 */

/**
 * @param {string|number|null|undefined} part
 * @param {number} [maxLength=40]
 * @returns {string}
 */
export function slugifyFilenamePart(part, maxLength = 40) {
  return String(part ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength);
}

/**
 * Build a download filename from slug parts.
 * @param {Array<string|number|null|undefined>} parts
 * @param {BuildExcelFilenameOptions} [options]
 * @returns {string}
 */
export function buildExcelFilename(parts, options = {}) {
  const {
    extension = 'xlsx',
    includeDate = true,
    maxPartLength = 40
  } = options;

  const slug = (parts ?? [])
    .map((part) => slugifyFilenamePart(part, maxPartLength))
    .filter(Boolean)
    .join('_') || 'export';

  if (!includeDate) {
    return `${slug}.${extension}`;
  }

  const datePart = new Date().toISOString().slice(0, 10);
  return `${slug}_${datePart}.${extension}`;
}

/**
 * Define and validate export columns for reuse across domain services.
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @returns {import('./excelExportTypes.js').ExcelColumnDef[]}
 */
export function defineExcelColumns(columns) {
  assertUniqueColumnKeys(columns, 'column definition');
  return columns.map((column) => ({ ...column }));
}

/**
 * Convert a row object into ordered cell values for a worksheet.
 * @param {Record<string, unknown>} row
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @returns {unknown[]}
 */
export function rowValuesForColumns(row, columns) {
  return columns.map((column) => row[column.key] ?? '');
}

/**
 * Map domain records into Excel row objects using a domain mapper.
 * @template T
 * @param {T[]} items
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @param {(item: T) => Record<string, unknown>} mapRow
 * @returns {Record<string, unknown>[]}
 */
export function mapToExcelRows(items, columns, mapRow) {
  return (items ?? []).map((item) => {
    const row = mapRow(item);
    const normalized = {};
    for (const column of columns) {
      normalized[column.key] = row[column.key] ?? '';
    }
    return normalized;
  });
}

/**
 * Filter column definitions by excluded keys.
 * @param {import('./excelExportTypes.js').ExcelColumnDef[]} columns
 * @param {Iterable<string>} excludeKeys
 * @returns {import('./excelExportTypes.js').ExcelColumnDef[]}
 */
export function excludeExcelColumns(columns, excludeKeys) {
  const excluded = excludeKeys instanceof Set ? excludeKeys : new Set(excludeKeys);
  return columns.filter((column) => !excluded.has(column.key));
}

/**
 * Remove keys from a row object.
 * @param {Record<string, unknown>} row
 * @param {Iterable<string>} keys
 * @returns {Record<string, unknown>}
 */
export function omitRowKeys(row, keys) {
  const omitted = { ...row };
  for (const key of keys) {
    delete omitted[key];
  }
  return omitted;
}

/**
 * Format common ERP Y/N active flags for Excel export.
 * @param {unknown} value
 * @returns {string}
 */
export function formatYnActiveFlag(value) {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'Y' || normalized === 'TRUE' || normalized === '1') {
    return 'Active';
  }
  if (normalized === 'N' || normalized === 'FALSE' || normalized === '0') {
    return 'Inactive';
  }
  return value == null ? '' : String(value);
}
