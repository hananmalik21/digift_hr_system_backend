/**
 * COMP.COMP_PLANS_FULL_V — request parsing, row mapping, list + detail helpers.
 */

import {
  listPlansFullViewHeaders,
  listPlansFullViewDetailRows,
  getPlanFullViewRowByPlanId,
  getPlanFullViewRowByPlanGuidHex,
  buildPlansFullViewFilterValues,
  PLANS_FULL_V_SORT_COLUMNS
} from '../model/compPlansFullViewModel.js';
import { parseSalaryStructurePageLimit } from '../../salary_structures/utils/parseSalaryStructurePageLimit.js';
import { parseRequiredEnterpriseId } from '../../salary_structures/utils/parseSalaryStructureEnterpriseId.js';
import { rowKeysUpper } from '../../salary_structures/utils/rowKeysUpper.js';
import { normalizePlanComponentForGetResponse } from '../utils/planComponentAdvancedSettings.js';

const JSON_COLUMN_NAMES_UPPER = new Set([
  'OWNER_OBJ',
  'PLAN_ATTRIBUTES_JSON',
  'PLAN_BUDGETS_JSON',
  'PLAN_BUSINESS_UNITS_JSON',
  'PLAN_COMPONENTS_JSON',
  'PLAN_EMPLOYMENT_TYPES_JSON',
  'PLAN_GRADES_JSON',
  'PLAN_JOB_FAMILIES_JSON',
  'PLAN_LOCATIONS_JSON',
  'PLAN_POSITIONS_JSON',
  'PLAN_SALARY_STRUCTURES_JSON'
]);

export function parsePlansFullViewListSort(query) {
  const allowed = Object.keys(PLANS_FULL_V_SORT_COLUMNS);
  let sortBy = 'plan_id';
  const rawBy = query.sort_by;
  if (rawBy != null && String(rawBy).trim() !== '') {
    sortBy = String(rawBy).trim().toLowerCase();
    if (!PLANS_FULL_V_SORT_COLUMNS[sortBy]) {
      throw new Error(`Invalid sort_by. Allowed: ${allowed.join(', ')}`);
    }
  }
  let sortOrder = 'DESC';
  const so = query.sort_order ?? query.sort_dir;
  if (so != null && String(so).trim() !== '') {
    const o = String(so).trim().toUpperCase();
    if (o !== 'ASC' && o !== 'DESC') {
      throw new Error('sort_order must be asc or desc');
    }
    sortOrder = o;
  }
  return { sortBy, sortOrder };
}

/**
 * @param {object} query - req.query
 * @returns {{ filterInput: ReturnType<typeof buildPlansFullViewFilterValues>, pagination: { page, pageSize }, sort: { sortBy, sortOrder } }}
 */
export function parsePlansFullViewListRequest(query) {
  const enterprise_id = parseRequiredEnterpriseId(query);
  const pagination = parseSalaryStructurePageLimit(query);
  const sort = parsePlansFullViewListSort(query);

  const filterInput = buildPlansFullViewFilterValues({
    enterprise_id,
    plan_id: query.plan_id,
    plan_code: query.plan_code,
    plan_name: query.plan_name,
    plan_type_code: query.plan_type_code,
    status_code: query.status_code,
    currency_code: query.currency_code,
    active_flag: query.active_flag,
    owner_employee_id: query.owner_employee_id,
    search: query.search
  });

  return { filterInput, pagination, sort };
}

function toIso(d) {
  if (d == null) return null;
  if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString();
  if (typeof d === 'string' && d.trim() !== '') {
    const dt = new Date(d);
    if (Number.isFinite(dt.getTime())) return dt.toISOString();
  }
  return null;
}

function mapPlanGuidVal(v) {
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
  const s = String(v).trim();
  return s === '' ? null : s.toUpperCase();
}

function mapPlanGuidFromRow(r) {
  return mapPlanGuidVal(r.PLAN_GUID);
}

function parseJsonFromDbVal(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'object' && !Buffer.isBuffer(val)) return val;
  const s = String(val).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>} r - rowKeysUpper
 */
function mapScalarHeaderFields(r) {
  const optNum = (k) => {
    const v = r[k];
    return v != null ? Number(v) : null;
  };
  const optStr = (k) => {
    const v = r[k];
    return v != null ? String(v) : null;
  };
  const active = r.ACTIVE_FLAG;
  return {
    plan_id: optNum('PLAN_ID'),
    plan_guid: mapPlanGuidFromRow(r),
    enterprise_id: optNum('ENTERPRISE_ID') ?? optNum('TENANT_ID'),
    plan_code: optStr('PLAN_CODE'),
    plan_name: optStr('PLAN_NAME'),
    plan_type_code: optStr('PLAN_TYPE_CODE'),
    status_code: optStr('STATUS_CODE'),
    currency_code: optStr('CURRENCY_CODE'),
    active_flag: active != null ? String(active) : null,
    owner_employee_id: optNum('OWNER_EMPLOYEE_ID')
  };
}

export function mapPlansFullViewHeaderRow(row) {
  const r = rowKeysUpper(row);
  const optStr = (k) => {
    const v = r[k];
    return v != null ? String(v) : null;
  };
  return {
    ...mapScalarHeaderFields(r),
    created_by: optStr('CREATED_BY'),
    creation_date: toIso(r.CREATION_DATE),
    last_updated_by: optStr('LAST_UPDATED_BY'),
    last_update_date: toIso(r.LAST_UPDATE_DATE)
  };
}

function oracleKeyToSnake(k) {
  return String(k).toLowerCase();
}

function normalizePlanComponentsJsonValue(val) {
  const parsed = parseJsonFromDbVal(val);
  if (!Array.isArray(parsed)) return parsed;
  return parsed.map(normalizePlanComponentForGetResponse);
}

export function mapPlansFullViewDetailRow(row) {
  const r = rowKeysUpper(row);
  const out = {};
  for (const [k, val] of Object.entries(r)) {
    const apiKey = oracleKeyToSnake(k);
    if (JSON_COLUMN_NAMES_UPPER.has(k)) {
      if (k === 'PLAN_COMPONENTS_JSON') {
        out[apiKey] = normalizePlanComponentsJsonValue(val);
      } else {
        out[apiKey] = parseJsonFromDbVal(val);
      }
      continue;
    }
    if (k === 'PLAN_GUID') {
      out[apiKey] = mapPlanGuidVal(val);
      continue;
    }
    if (val instanceof Date && Number.isFinite(val.getTime())) {
      out[apiKey] = toIso(val);
      continue;
    }
    out[apiKey] = val == null ? null : val;
  }
  return out;
}

export async function listPlansHeadersEndpoint(filterInput, pagination, sort) {
  const { rows, total } = await listPlansFullViewHeaders(filterInput, pagination, sort);
  return {
    data: rows.map(mapPlansFullViewHeaderRow),
    total
  };
}

export async function listPlansFullDetailEndpoint(filterInput, pagination, sort) {
  const { rows, total } = await listPlansFullViewDetailRows(filterInput, pagination, sort);
  return {
    data: rows.map(mapPlansFullViewDetailRow),
    total
  };
}

export async function getPlanFullViewByPlanId(planId) {
  const row = await getPlanFullViewRowByPlanId(planId);
  if (row == null) return null;
  return mapPlansFullViewDetailRow(row);
}

export async function getPlanFullViewByPlanGuidHex(planGuidHex) {
  const row = await getPlanFullViewRowByPlanGuidHex(planGuidHex);
  if (row == null) return null;
  return mapPlansFullViewDetailRow(row);
}
