/**
 * Salary structures — COMP.COMP_SALARY_STRUCTURE_JSON_V list (headers) and detail (nested JSON).
 * GET /salary-structures-details without structure_id/structure_guid: paginated full rows (same filters as list route).
 */

import {
  listSalaryStructureHeadersFromJsonView,
  listSalaryStructureFullRowsFromJsonView,
  getSalaryStructureDetailRowFromJsonView,
  buildJsonViewListFilterValues,
  SALARY_STRUCTURE_JSON_V_LIST_SORT_COLUMNS
} from '../model/compSalaryStructureJsonViewModel.js';
import { parseSalaryStructurePageLimit } from '../utils/parseSalaryStructurePageLimit.js';
import { parseRequiredEnterpriseId } from '../utils/parseSalaryStructureEnterpriseId.js';
import { rowKeysUpper } from '../utils/rowKeysUpper.js';
import { normalizeStructureGuid } from './compSalaryStructureService.js';

function parseOptionalStructureIdFromQuery(query) {
  if (query.structure_id === undefined || query.structure_id === null || String(query.structure_id).trim() === '') {
    return null;
  }
  const n = parseInt(String(query.structure_id), 10);
  if (Number.isNaN(n) || n < 1) {
    throw new Error('structure_id must be a valid positive integer');
  }
  return n;
}

function parseOptionalStructureGuidHexFromQuery(query) {
  if (query.structure_guid === undefined || query.structure_guid === null || String(query.structure_guid).trim() === '') {
    return null;
  }
  const g = normalizeStructureGuid(String(query.structure_guid).trim());
  if (!g) {
    throw new Error('structure_guid must be a 32-character hexadecimal string');
  }
  return g;
}

export function parseSalaryStructureJsonListSort(query) {
  const allowed = Object.keys(SALARY_STRUCTURE_JSON_V_LIST_SORT_COLUMNS);
  let sortBy = 'structure_id';
  const rawBy = query.sort_by;
  if (rawBy != null && String(rawBy).trim() !== '') {
    sortBy = String(rawBy).trim().toLowerCase();
    if (!SALARY_STRUCTURE_JSON_V_LIST_SORT_COLUMNS[sortBy]) {
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
 * @returns {{ filterInput: object, pagination: { page, pageSize }, sort: { sortBy, sortOrder } }}
 */
export function parseSalaryStructureListRequest(query) {
  const enterprise_id = parseRequiredEnterpriseId(query);
  const pagination = parseSalaryStructurePageLimit(query);
  const sort = parseSalaryStructureJsonListSort(query);

  const structure_id = parseOptionalStructureIdFromQuery(query);
  const structure_guid = parseOptionalStructureGuidHexFromQuery(query);

  const search =
    query.search != null && String(query.search).trim() !== '' ? String(query.search).trim() : null;

  let status = null;
  if (query.status != null && String(query.status).trim() !== '') {
    const u = String(query.status).trim().toUpperCase();
    if (u !== 'ACTIVE' && u !== 'INACTIVE' && u !== 'ALL') {
      throw new Error('status must be ACTIVE, INACTIVE, or ALL');
    }
    status = u;
  }

  const filterInput = buildJsonViewListFilterValues({
    enterprise_id,
    structure_id,
    structure_guid,
    search,
    status
  });

  return { filterInput, pagination, sort };
}

/**
 * Detail key only — use when query includes structure_id and/or structure_guid.
 * @returns {{ enterprise_id: number, structure_id: number|null, structure_guid_hex: string|null }}
 */
export function parseSalaryStructureDetailRequest(query) {
  const enterprise_id = parseRequiredEnterpriseId(query);

  const structure_id = parseOptionalStructureIdFromQuery(query);
  const structure_guid_hex = parseOptionalStructureGuidHexFromQuery(query);

  if (structure_id == null && structure_guid_hex == null) {
    throw new Error('structure_id or structure_guid is required');
  }

  return { enterprise_id, structure_id, structure_guid_hex };
}

export function mapStructureGuidFromRow(r) {
  const v = r.STRUCTURE_GUID;
  if (v == null) return null;
  if (Buffer.isBuffer(v)) return v.toString('hex').toUpperCase();
  const s = String(v).trim();
  return s === '' ? null : s.toUpperCase();
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

/** @param {Record<string, unknown>} r - rowKeysUpper(view row) */
function mapJsonViewHeaderFieldsFromUpperRow(r) {
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
    structure_id: optNum('STRUCTURE_ID'),
    structure_guid: mapStructureGuidFromRow(r),
    enterprise_id: optNum('ENTERPRISE_ID') ?? optNum('TENANT_ID'),
    structure_code: optStr('STRUCTURE_CODE'),
    structure_name: optStr('STRUCTURE_NAME'),
    active_flag: active != null ? String(active) : null
  };
}

/** List/grid row — header fields only. */
export function mapJsonViewListRowToResponse(row) {
  const r = rowKeysUpper(row);
  const optStr = (k) => {
    const v = r[k];
    return v != null ? String(v) : null;
  };
  return {
    ...mapJsonViewHeaderFieldsFromUpperRow(r),
    created_by: optStr('CREATED_BY'),
    creation_date: toIso(r.CREATION_DATE),
    last_updated_by: optStr('LAST_UPDATED_BY'),
    last_update_date: toIso(r.LAST_UPDATE_DATE)
  };
}

function parseJsonFromDbVal(val) {
  if (val == null || val === '') return { kind: 'empty' };
  if (typeof val === 'object' && !Buffer.isBuffer(val)) return { kind: 'raw', value: val };
  const s = String(val).trim();
  if (!s) return { kind: 'empty' };
  try {
    return { kind: 'raw', value: JSON.parse(s) };
  } catch {
    return { kind: 'bad' };
  }
}

function normalizeArrayJson(val) {
  const p = parseJsonFromDbVal(val);
  if (p.kind === 'empty' || p.kind === 'bad') return [];
  const v = p.value;
  if (Array.isArray(v)) return v;
  if (v !== null && typeof v === 'object') return [v];
  return [];
}

function normalizeObjectJson(val) {
  const p = parseJsonFromDbVal(val);
  if (p.kind === 'empty' || p.kind === 'bad') return {};
  const v = p.value;
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) return v;
  return {};
}

/**
 * GET …/salary-structures-details (single row and paginated list) — fixed 14 keys, no audit columns.
 */
export function mapJsonViewDetailRowToResponse(row) {
  const r = rowKeysUpper(row);
  return {
    ...mapJsonViewHeaderFieldsFromUpperRow(r),
    structure: normalizeObjectJson(r.STRUCTURE_OBJ),
    advanced_settings: normalizeObjectJson(r.ADVANCED_SETTINGS_OBJ),
    org_scopes: normalizeArrayJson(r.ORG_SCOPES_JSON),
    financial_details: normalizeArrayJson(r.FINANCIAL_DETAILS_JSON),
    grade_ranges: normalizeArrayJson(r.GRADE_RANGES_JSON),
    job_families: normalizeArrayJson(r.JOB_FAMILIES_JSON),
    positions: normalizeArrayJson(r.POSITIONS_JSON),
    components: normalizeArrayJson(r.COMPONENTS_JSON)
  };
}

/**
 * Paginated GET …/salary-structures-details (no structure key): full view rows, detail API shape.
 */
export async function listSalaryStructureDetailEndpointPaginated(filterInput, pagination, sort) {
  const { rows, total } = await listSalaryStructureFullRowsFromJsonView(
    filterInput,
    pagination,
    sort
  );
  return {
    data: rows.map(mapJsonViewDetailRowToResponse),
    total
  };
}

/** Grid list for GET …/salary-structures — header columns + audit fields. */
export async function listSalaryStructureHeaders(filterInput, pagination, sort) {
  const { rows, total } = await listSalaryStructureHeadersFromJsonView(filterInput, pagination, sort);
  return {
    data: rows.map(mapJsonViewListRowToResponse),
    total
  };
}

export async function getSalaryStructureDetail(key) {
  const row = await getSalaryStructureDetailRowFromJsonView(key);
  if (row == null) return null;
  return mapJsonViewDetailRowToResponse(row);
}
