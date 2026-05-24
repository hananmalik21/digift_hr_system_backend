/**
 * Employee components from COMP.COMP_EMP_COMPONENTS_JSON_V — parse, filter, group, sort.
 */

import { normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { buildPaginationMeta } from '../../../../utils/paginationUtils.js';
import {
  oracleTextToString,
  formatOracleDateToIsoDay,
  parseJsonLoose
} from '../../employee_compensation/utils/oracleCompensationRead.js';
import {
  countEmpComponentsJsonRows,
  listEmpComponentsJsonRows
} from '../model/empComponentsJsonModel.js';

const COMPONENT_FIELDS = [
  'assignment_detail_id',
  'plan_id',
  'component_id',
  'component_code',
  'component_name',
  'amount',
  'currency_code',
  'frequency_code',
  'process_status'
];

function pick(obj, keys) {
  const out = {};
  for (const key of keys) {
    const upper = key.toUpperCase();
    if (obj[key] !== undefined) out[key] = obj[key];
    else if (obj[upper] !== undefined) out[key] = obj[upper];
    else out[key] = null;
  }
  return out;
}

function isTruthyActiveFlag(value) {
  if (value == null || String(value).trim() === '') return true;
  const u = String(value).trim().toUpperCase();
  return u === 'Y' || u === 'YES' || u === 'TRUE' || u === '1';
}

function isComponentCurrentlyActive(component) {
  if (!isTruthyActiveFlag(component.active_flag ?? component.ACTIVE_FLAG)) {
    return false;
  }

  const endRaw = component.effective_end_date ?? component.EFFECTIVE_END_DATE;
  if (endRaw == null || String(endRaw).trim() === '') return true;

  const endDay = formatOracleDateToIsoDay(endRaw);
  if (!endDay) return true;

  const today = new Date().toISOString().slice(0, 10);
  return endDay >= today;
}

/**
 * @param {unknown} value
 * @returns {Promise<object[]>}
 */
async function parseComponentsJson(value) {
  if (value == null) return [];

  if (Array.isArray(value)) {
    return value.filter((item) => item != null && typeof item === 'object');
  }

  if (typeof value === 'object' && !Buffer.isBuffer(value)) {
    if (typeof value.getData === 'function') {
      const text = await oracleTextToString(value);
      const parsed = parseJsonLoose(text);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  }

  const text = await oracleTextToString(value);
  const parsed = parseJsonLoose(text);
  return Array.isArray(parsed) ? parsed : [];
}

function mapComponent(component, planIdFilter) {
  if (!isComponentCurrentlyActive(component)) return null;

  const planId = component.plan_id ?? component.PLAN_ID;
  if (planIdFilter != null && Number(planId) !== planIdFilter) {
    return null;
  }

  return pick(component, COMPONENT_FIELDS);
}

function sortComponents(components) {
  return [...components].sort((a, b) => {
    const nameA = String(a.component_name ?? '').toUpperCase();
    const nameB = String(b.component_name ?? '').toUpperCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return Number(a.component_id ?? 0) - Number(b.component_id ?? 0);
  });
}

/**
 * @param {object} row
 * @param {number|null} planIdFilter
 * @returns {Promise<object|null>}
 */
async function mapEmployeeRow(row, planIdFilter) {
  const enterpriseId = row.ENTERPRISE_ID ?? row.enterprise_id;
  const employeeGuidRaw =
    row.EMPLOYEE_GUID_HEX ??
    row.employee_guid_hex ??
    row.EMPLOYEE_GUID ??
    row.employee_guid;

  const guidHex = normalizeApiGuidString(employeeGuidRaw);
  if (!guidHex) return null;

  const rawJson = row.COMPONENTS_JSON ?? row.components_json;
  const parsed = await parseComponentsJson(rawJson);

  const components = sortComponents(
    parsed.map((c) => mapComponent(c, planIdFilter)).filter(Boolean)
  );

  if (planIdFilter != null && components.length === 0) {
    return null;
  }

  return {
    enterprise_id: enterpriseId,
    employee_guid: guidHex,
    components
  };
}

/**
 * @param {{
 *   enterprise_id: number,
 *   employee_guids: string[],
 *   plan_id: number|null,
 *   pagination: { page: number, pageSize: number }
 * }} filters
 */
export async function listEmployeeComponentsJson(filters) {
  const [totalEmployees, rows] = await Promise.all([
    countEmpComponentsJsonRows(filters),
    listEmpComponentsJsonRows(filters)
  ]);

  const mapped = await Promise.all(rows.map((row) => mapEmployeeRow(row, filters.plan_id)));
  const employees = mapped.filter(Boolean);

  employees.sort((a, b) => String(a.employee_guid).localeCompare(String(b.employee_guid)));

  const pagination = buildPaginationMeta(
    filters.pagination.page,
    filters.pagination.pageSize,
    totalEmployees
  );

  return {
    count: employees.length,
    employees,
    pagination
  };
}
