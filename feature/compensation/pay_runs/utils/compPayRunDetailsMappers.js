/**
 * Map COMP.V_COMP_PAY_RUN_DETAILS rows to camelCase API objects
 * and nest flat header+line rows into payRun → employees → lines.
 */

import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import { rowKeysUpper } from '../../salary_structures/utils/rowKeysUpper.js';

const SEARCH_HEADER_KEYS = [
  'payRunId',
  'enterpriseId',
  'planId',
  'runType',
  'runStatus',
  'runStartDate',
  'runEndDate',
  'processMonthName',
  'processMonthNo',
  'processYear',
  'processPeriod',
  'processPeriodCode'
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function pick(obj, keys) {
  const out = {};
  for (const key of keys) out[key] = obj[key];
  return out;
}

/**
 * Oracle NUMBER / driver values → JS number (or null).
 * @param {unknown} value
 * @returns {number|null}
 */
export function toNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {unknown} value
 * @returns {string|null}
 */
export function toStringOrNull(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * Format Oracle DATE/TIMESTAMP as local `YYYY-MM-DDTHH:mm:ss` (no Z),
 * matching the pay-run details API contract and avoiding UTC day-shift.
 * @param {unknown} value
 * @returns {string|null}
 */
export function toApiDateTimeOrNull(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}T${pad2(value.getHours())}:${pad2(value.getMinutes())}:${pad2(value.getSeconds())}`;
  }

  const s = String(value).trim();
  if (!s) return null;
  const isoLike = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
  if (isoLike) return `${isoLike[1]}T${isoLike[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T00:00:00`;

  const parsed = new Date(s);
  if (!Number.isFinite(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}T${pad2(parsed.getHours())}:${pad2(parsed.getMinutes())}:${pad2(parsed.getSeconds())}`;
}

function asRow(row) {
  return rowKeysUpper(row);
}

/**
 * Pay-run header from a view row (header columns are repeated on every line).
 * @param {object} row - Oracle row (any key casing)
 */
export function mapPayRunHeader(row) {
  if (!row) return null;
  const r = asRow(row);
  return {
    payRunId: toNumberOrNull(r.PAY_RUN_ID),
    enterpriseId: toNumberOrNull(r.ENTERPRISE_ID),
    planId: toNumberOrNull(r.PAY_RUN_PLAN_ID),
    runType: toStringOrNull(r.RUN_TYPE),
    runStatus: toStringOrNull(r.RUN_STATUS),
    runStartDate: toApiDateTimeOrNull(r.RUN_START_DATE),
    runEndDate: toApiDateTimeOrNull(r.RUN_END_DATE),
    processMonthName: toStringOrNull(r.PROCESS_MONTH_NAME),
    processMonthNo: toNumberOrNull(r.PROCESS_MONTH_NO),
    processYear: toNumberOrNull(r.PROCESS_YEAR),
    processPeriod: toStringOrNull(r.PROCESS_PERIOD),
    processPeriodCode: toStringOrNull(r.PROCESS_PERIOD_CODE),
    totalSelected: toNumberOrNull(r.TOTAL_SELECTED),
    totalProcessed: toNumberOrNull(r.TOTAL_PROCESSED),
    totalFailed: toNumberOrNull(r.TOTAL_FAILED),
    createdBy: toStringOrNull(r.RUN_CREATED_BY),
    creationDate: toApiDateTimeOrNull(r.RUN_CREATION_DATE),
    lastUpdatedBy: toStringOrNull(r.RUN_LAST_UPDATED_BY),
    lastUpdateDate: toApiDateTimeOrNull(r.RUN_LAST_UPDATE_DATE)
  };
}

/**
 * Compact header used by the single-employee details endpoint.
 * @param {object} row
 */
export function mapPayRunHeaderSummary(row) {
  const full = mapPayRunHeader(row);
  if (!full) return null;
  return pick(full, ['payRunId', 'runType', 'runStatus', 'processPeriod']);
}

/**
 * One pay-run line (component assignment) from a view row.
 * @param {object} row
 */
export function mapPayRunLine(row) {
  if (!row) return null;
  const r = asRow(row);
  const componentId = toNumberOrNull(r.COMPONENT_ID);
  const employeeId = toNumberOrNull(r.EMPLOYEE_ID);
  if (componentId == null && employeeId == null && toNumberOrNull(r.ASSIGNMENT_DTL_ID) == null) {
    return null;
  }
  return {
    componentId,
    planId: toNumberOrNull(r.LINE_PLAN_ID),
    assignmentDtlId: toNumberOrNull(r.ASSIGNMENT_DTL_ID),
    amount: toNumberOrNull(r.AMOUNT),
    currencyCode: toStringOrNull(r.CURRENCY_CODE),
    processStatus: toStringOrNull(r.PROCESS_STATUS),
    errorMessage: toStringOrNull(r.ERROR_MESSAGE),
    processedDate: toApiDateTimeOrNull(r.PROCESSED_DATE),
    createdBy: toStringOrNull(r.LINE_CREATED_BY),
    creationDate: toApiDateTimeOrNull(r.LINE_CREATION_DATE),
    lastUpdatedBy: toStringOrNull(r.LINE_LAST_UPDATED_BY)
  };
}

/**
 * Failed-line row: line fields plus employeeId so callers can locate the error.
 * @param {object} row
 */
export function mapFailedPayRunLine(row) {
  const line = mapPayRunLine(row);
  if (!line) return null;
  return {
    employeeId: toNumberOrNull(asRow(row).EMPLOYEE_ID),
    ...line
  };
}

/**
 * Distinct pay-run summary for the by-employee search.
 * @param {object} row
 */
export function mapPayRunSearchRow(row) {
  const header = mapPayRunHeader(row);
  return header ? pick(header, SEARCH_HEADER_KEYS) : null;
}

/**
 * Aggregated employee row from the GROUP BY query.
 * totalAmount is the sum of available line amounts — not net salary.
 * @param {object} row
 */
export function mapPayRunEmployeeSummary(row) {
  if (!row) return null;
  const r = asRow(row);
  return {
    employeeId: toNumberOrNull(r.EMPLOYEE_ID),
    totalLines: toNumberOrNull(r.TOTAL_LINES) ?? 0,
    totalAmount: toNumberOrNull(r.TOTAL_AMOUNT) ?? 0,
    completedLines: toNumberOrNull(r.COMPLETED_LINES) ?? 0,
    failedLines: toNumberOrNull(r.FAILED_LINES) ?? 0
  };
}

/**
 * Transform flat view rows (header repeated per line) into nested JSON.
 * Employees keep the SQL order (EMPLOYEE_ID, COMPONENT_ID).
 *
 * @param {object[]} rows
 * @returns {{ payRun: object, employees: Array<{ employeeId: number, lines: object[] }> } | null}
 */
export function nestPayRunDetails(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const payRun = mapPayRunHeader(rows[0]);
  const byEmployee = new Map();

  for (const row of rows) {
    const r = asRow(row);
    const employeeId = toNumberOrNull(r.EMPLOYEE_ID);
    if (employeeId == null) continue;

    if (!byEmployee.has(employeeId)) {
      byEmployee.set(employeeId, { employeeId, lines: [] });
    }
    const line = mapPayRunLine(r);
    if (line) byEmployee.get(employeeId).lines.push(line);
  }

  return {
    payRun,
    employees: [...byEmployee.values()]
  };
}

/**
 * Nested payload for a single employee.
 * @param {object[]} rows
 * @param {number} employeeId
 */
export function nestPayRunEmployeeDetails(rows, employeeId) {
  const nested = nestPayRunDetails(rows);
  if (!nested) return null;

  const employee =
    nested.employees.find((e) => e.employeeId === employeeId) || { employeeId, lines: [] };

  return {
    payRun: mapPayRunHeaderSummary(rows[0]),
    employee
  };
}

/**
 * Same pagination envelope as other compensation GET list APIs
 * (adjustments, salary-change-history): page, limit, total, total_pages, has_next, has_previous.
 *
 * @param {number} page
 * @param {number} limit
 * @param {number} totalCount
 */
export function buildPagination(page, limit, totalCount) {
  const total = Number.isFinite(Number(totalCount)) ? Number(totalCount) : 0;
  const meta = buildPaginationMeta(page, limit, total);
  return {
    page: meta.page,
    limit: meta.pageSize,
    total: meta.total,
    total_pages: meta.totalPages,
    has_next: meta.hasNext,
    has_previous: meta.hasPrevious
  };
}
