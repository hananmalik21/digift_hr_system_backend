import { buildExcelExport } from './excelExportService.js';
import { defineExcelColumns, mapToExcelRows } from './excelExportHelpers.js';

const DEFAULT_WIDE_COLUMN_KEYS = new Set([
  'position',
  'org_unit',
  'status',
  'justification',
  'budget',
  'audit',
  'requisition_detail',
  'position_detail',
  'education_experience',
  'hiring_team',
  'job_family',
  'job_level',
  'grade',
  'interview_panel',
  'skills',
  'quick_stats',
  'location_obj',
  'structure',
  'advanced_settings',
  'org_scopes',
  'financial_details',
  'grade_ranges',
  'job_families',
  'positions',
  'employment_types',
  'components'
]);

/**
 * @param {unknown} value
 * @returns {string|number|boolean}
 */
export function formatJsonExportValue(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return /** @type {string|number|boolean} */ (value);
}

/**
 * @param {string} key
 */
export function headerFromExportKey(key) {
  return String(key)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * @param {string} key
 * @param {{ wideKeys?: Set<string> }} [options]
 */
export function exportColumnWidthForKey(key, options = {}) {
  const wideKeys = options.wideKeys ?? DEFAULT_WIDE_COLUMN_KEYS;
  if (
    key.endsWith('_json')
    || key.endsWith('_obj')
    || key.endsWith('_hierarchy')
    || key.endsWith('_list')
  ) {
    return 48;
  }
  if (wideKeys.has(key)) return 40;
  if (key.endsWith('_guid')) return 36;
  if (key.includes('date')) return 20;
  return 18;
}

/**
 * @param {object[]} rows
 * @param {string[]} [preferredOrder]
 * @returns {string[]}
 */
export function collectExportKeys(rows, preferredOrder = []) {
  const keys = new Set(preferredOrder);
  for (const row of rows ?? []) {
    if (row != null && typeof row === 'object') {
      Object.keys(row).forEach((key) => keys.add(key));
    }
  }

  const ordered = preferredOrder.filter((key) => keys.has(key));
  for (const key of [...keys].sort()) {
    if (!ordered.includes(key)) ordered.push(key);
  }
  return ordered;
}

/**
 * @param {string[]} keys
 * @param {{ wideKeys?: Set<string> }} [options]
 */
export function buildDynamicExportColumns(keys, options = {}) {
  return defineExcelColumns(
    keys.map((key) => ({
      header: headerFromExportKey(key),
      key,
      width: exportColumnWidthForKey(key, options)
    }))
  );
}

/**
 * @param {Record<string, unknown>} row
 * @param {string[]} keys
 */
export function mapApiRowForExcel(row, keys) {
  const out = {};
  for (const key of keys) {
    out[key] = formatJsonExportValue(row?.[key]);
  }
  return out;
}

/**
 * Build an Excel export from API list rows with dynamic columns (JSON values stringified).
 * @param {{
 *   rows: object[],
 *   sheetName: string,
 *   filenameParts: Array<string|number|null|undefined>,
 *   keyOrder?: string[],
 *   wideKeys?: Set<string>
 * }} params
 */
export async function buildDynamicApiExcelBuffer({
  rows,
  sheetName,
  filenameParts,
  keyOrder = [],
  wideKeys
}) {
  const columnOptions = wideKeys ? { wideKeys } : {};
  const exportKeys = collectExportKeys(rows, keyOrder);
  const columns = buildDynamicExportColumns(exportKeys, columnOptions);
  const excelRows = mapToExcelRows(rows, columns, (row) => mapApiRowForExcel(row, exportKeys));

  return buildExcelExport({
    sheets: [{
      name: sheetName,
      columns,
      rows: excelRows
    }],
    filenameParts,
    freezeHeader: true,
    autoFilter: true
  });
}
