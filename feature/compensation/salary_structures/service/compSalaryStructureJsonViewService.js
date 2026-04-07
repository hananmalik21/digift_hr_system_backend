/**
 * Salary structures — COMP.COMP_SALARY_STRUCTURE_JSON_V.
 * List (GET /salary-structures): header + audit + structure_type_code + location_obj (same LOCATION_OBJ parsing as detail).
 * Detail (GET /salary-structures-details): nested JSON sections; paginated when no structure key (same filters as list).
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

/** Duplicated at response root; stripped from nested `structure` in details. */
const PROMOTED_STRUCTURE_HEADER_KEYS = ['structure_type_code', 'location_obj'];

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

  const filterInput = buildJsonViewListFilterValues({
    enterprise_id,
    structure_id,
    structure_guid,
    search,
    status: query.status
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

function nonEmptyStringOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function objectHasOwnKeys(o) {
  return o != null && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0;
}

/**
 * Prefer view columns STRUCTURE_TYPE_CODE / LOCATION_OBJ; fall back to the same keys inside STRUCTURE_OBJ
 * (list + details parity when the view only embeds them in STRUCTURE_OBJ).
 */
function mergeHeaderTypeAndLocation(header, structure, locationFromView) {
  const structure_type_code =
    nonEmptyStringOrNull(header.structure_type_code) ??
    nonEmptyStringOrNull(structure.structure_type_code) ??
    null;

  const location_obj = objectHasOwnKeys(locationFromView)
    ? locationFromView
    : objectHasOwnKeys(structure.location_obj)
      ? structure.location_obj
      : locationFromView;

  return { structure_type_code, location_obj };
}

function structureWithoutPromotedHeaderFields(structure) {
  if (structure == null || typeof structure !== 'object' || Array.isArray(structure)) return structure;
  const out = { ...structure };
  for (const k of PROMOTED_STRUCTURE_HEADER_KEYS) delete out[k];
  return out;
}

/** @param {Record<string, unknown>} r - rowKeysUpper(view row) */
function fieldString(r, col) {
  const v = r[col];
  return v != null ? String(v) : null;
}

/** @param {Record<string, unknown>} r - rowKeysUpper(view row) */
function mapJsonViewHeaderFieldsFromUpperRow(r) {
  const optNum = (k) => {
    const v = r[k];
    return v != null ? Number(v) : null;
  };
  const active = r.ACTIVE_FLAG;
  return {
    structure_id: optNum('STRUCTURE_ID'),
    structure_guid: mapStructureGuidFromRow(r),
    enterprise_id: optNum('ENTERPRISE_ID') ?? optNum('TENANT_ID'),
    structure_code: fieldString(r, 'STRUCTURE_CODE'),
    structure_name: fieldString(r, 'STRUCTURE_NAME'),
    structure_type_code: fieldString(r, 'STRUCTURE_TYPE_CODE'),
    active_flag: active != null ? String(active) : null
  };
}

/** List/grid row — same type + location merge as mapJsonViewDetailRowToResponse (plus audit columns). */
export function mapJsonViewListRowToResponse(row) {
  const r = rowKeysUpper(row);
  const header = mapJsonViewHeaderFieldsFromUpperRow(r);
  const structure = normalizeObjectJson(r.STRUCTURE_OBJ);
  const locationFromView = normalizeObjectJson(r.LOCATION_OBJ);
  const { structure_type_code, location_obj } = mergeHeaderTypeAndLocation(header, structure, locationFromView);
  return {
    ...header,
    structure_type_code,
    location_obj,
    created_by: fieldString(r, 'CREATED_BY'),
    creation_date: toIso(r.CREATION_DATE),
    last_updated_by: fieldString(r, 'LAST_UPDATED_BY'),
    last_update_date: toIso(r.LAST_UPDATE_DATE)
  };
}

/**
 * GET …/salary-structures-details (single row and paginated list) — structure payload + arrays, no audit columns.
 */
export function mapJsonViewDetailRowToResponse(row) {
  const r = rowKeysUpper(row);
  const header = mapJsonViewHeaderFieldsFromUpperRow(r);
  const structureParsed = normalizeObjectJson(r.STRUCTURE_OBJ);
  const locationFromView = normalizeObjectJson(r.LOCATION_OBJ);
  const { structure_type_code, location_obj } = mergeHeaderTypeAndLocation(
    header,
    structureParsed,
    locationFromView
  );

  return {
    ...header,
    structure_type_code,
    location_obj,
    structure: structureWithoutPromotedHeaderFields(structureParsed),
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
