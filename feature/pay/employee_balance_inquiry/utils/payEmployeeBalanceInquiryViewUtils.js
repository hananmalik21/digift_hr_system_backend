import {
  rowKeysUpper,
  readScalarCount,
  toIsoDateTimeOrNull,
  toNumberOrNull,
  toStringOrNull
} from '../../element_entries/utils/payElementEntriesViewUtils.js';
import { normalizePayViewGuid } from '../../utils/payViewModelUtils.js';

export { readScalarCount };

/**
 * Format Oracle DATE as YYYY-MM-DD using local calendar parts
 * (avoids UTC day-shift from Date#toISOString).
 * @param {unknown} value
 * @returns {string|null}
 */
function toLocalDateOnlyOrNull(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  if (Number.isNaN(parsed.getTime())) return null;
  return toLocalDateOnlyOrNull(parsed);
}

/**
 * @param {Record<string, unknown>} row
 */
function createRowReader(row) {
  const r = rowKeysUpper(row);
  return {
    raw: r,
    num: (key) => toNumberOrNull(r[key]),
    str: (key) => toStringOrNull(r[key]),
    guid: (key) => normalizePayViewGuid(r[key]),
    date: (key) => toLocalDateOnlyOrNull(r[key]),
    dateTime: (key) => toIsoDateTimeOrNull(r[key])
  };
}

/**
 * Balance object — dimension values stay independent; null remains null.
 * @param {ReturnType<typeof createRowReader>} g
 */
function mapBalance(g) {
  return {
    balance_id: g.num('BALANCE_ID'),
    balance_guid: g.guid('BALANCE_GUID'),
    balance_code: g.str('BALANCE_CODE'),
    balance_name: g.str('BALANCE_NAME'),
    balance_name_en: g.str('BALANCE_NAME_EN'),
    balance_name_ar: g.str('BALANCE_NAME_AR'),
    balance_category_id: g.num('BALANCE_CATEGORY_ID'),
    balance_category_code: g.str('BALANCE_CATEGORY_CODE'),
    balance_uom_code: g.str('BALANCE_UOM_CODE'),
    balance_type_code: g.str('BALANCE_TYPE_CODE'),
    currency_code: g.str('CURRENCY_CODE'),
    display_uom_code: g.str('DISPLAY_UOM_CODE'),
    current_value: g.num('CURRENT_VALUE'),
    mtd_value: g.num('MTD_VALUE'),
    qtd_value: g.num('QTD_VALUE'),
    ytd_value: g.num('YTD_VALUE'),
    itd_value: g.num('ITD_VALUE'),
    current_effective_date: g.date('CURRENT_EFFECTIVE_DATE'),
    mtd_effective_date: g.date('MTD_EFFECTIVE_DATE'),
    qtd_effective_date: g.date('QTD_EFFECTIVE_DATE'),
    ytd_effective_date: g.date('YTD_EFFECTIVE_DATE'),
    itd_effective_date: g.date('ITD_EFFECTIVE_DATE'),
    last_effective_date: g.date('LAST_EFFECTIVE_DATE'),
    last_updated_date: g.dateTime('LAST_UPDATED_DATE')
  };
}

/**
 * @param {ReturnType<typeof createRowReader>} g
 */
function mapEmployeeHeader(g) {
  return {
    employee_id: g.num('EMPLOYEE_ID'),
    employee_guid: g.guid('EMPLOYEE_GUID'),
    employee_number: g.str('EMPLOYEE_NUMBER'),
    employee_name: g.str('EMPLOYEE_NAME'),
    employee_name_en: g.str('EMPLOYEE_NAME_EN'),
    employee_name_ar: g.str('EMPLOYEE_NAME_AR'),
    employee_initials: g.str('EMPLOYEE_INITIALS'),
    email: g.str('EMAIL'),
    assignment_id: g.num('ASSIGNMENT_ID'),
    assignment_guid: g.guid('ASSIGNMENT_GUID'),
    work_location_id: g.num('WORK_LOCATION_ID'),
    position_id: g.num('POSITION_ID'),
    position_guid: g.guid('POSITION_GUID'),
    job_family_id: g.num('JOB_FAMILY_ID'),
    job_level_id: g.num('JOB_LEVEL_ID'),
    grade_id: g.num('GRADE_ID'),
    enterprise_hire_date: g.date('ENTERPRISE_HIRE_DATE'),
    contract_type_code: g.str('CONTRACT_TYPE_CODE'),
    payroll_id: g.num('PAYROLL_ID'),
    payroll_name: g.str('PAYROLL_NAME'),
    balances: []
  };
}

/**
 * Group relational EMPLOYEE+BALANCE rows into one employee object with balances[].
 * Key: ENTERPRISE_ID + EMPLOYEE_ID
 * @param {Record<string, unknown>[]} rows
 * @returns {object[]}
 */
export function groupRowsByEmployee(rows) {
  const employeeMap = new Map();

  for (const row of rows || []) {
    const g = createRowReader(row);
    const employeeId = g.raw.EMPLOYEE_ID;
    if (employeeId == null) continue;

    const key = `${g.raw.ENTERPRISE_ID}:${employeeId}`;
    if (!employeeMap.has(key)) {
      employeeMap.set(key, mapEmployeeHeader(g));
    }

    if (g.raw.BALANCE_ID == null) continue;
    employeeMap.get(key).balances.push(mapBalance(g));
  }

  return Array.from(employeeMap.values());
}
