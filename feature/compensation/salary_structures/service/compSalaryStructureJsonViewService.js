/**
 * Salary structures — full nested JSON from COMP.COMP_SALARY_STRUCTURE_JSON_V (list + pagination).
 * Maps view JSON columns to API field names; no joins in Node.
 */

import {
  listSalaryStructuresFromJsonView,
  buildJsonViewFilterBinds
} from '../model/compSalaryStructureJsonViewModel.js';
import { parseSalaryStructurePageLimit } from '../utils/parseSalaryStructurePageLimit.js';
import { parseRequiredEnterpriseId } from '../utils/parseSalaryStructureEnterpriseId.js';
import { rowKeysUpper } from '../utils/rowKeysUpper.js';

/**
 * @returns {{ filterInput: { enterprise_id: number, structure_id: number|null, search: string|null, status: string|null }, pagination: { page: number, pageSize: number } }}
 */
export function parseSalaryStructureJsonFullRequest(query) {
  const enterprise_id = parseRequiredEnterpriseId(query);

  let structure_id = null;
  if (
    query.structure_id !== undefined &&
    query.structure_id !== null &&
    String(query.structure_id).trim() !== ''
  ) {
    const n = parseInt(String(query.structure_id), 10);
    if (Number.isNaN(n) || n < 1) {
      throw new Error('structure_id must be a valid positive integer');
    }
    structure_id = n;
  }

  const search =
    query.search != null && String(query.search).trim() !== ''
      ? String(query.search).trim()
      : null;

  let status = null;
  if (query.status != null && String(query.status).trim() !== '') {
    const u = String(query.status).trim().toUpperCase();
    if (u !== 'ACTIVE' && u !== 'INACTIVE' && u !== 'ALL') {
      throw new Error('status must be ACTIVE, INACTIVE, or ALL');
    }
    status = u;
  }

  const pagination = parseSalaryStructurePageLimit(query);

  return {
    filterInput: { enterprise_id, structure_id, search, status },
    pagination
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

export function mapJsonViewRowToResponse(row) {
  const r = rowKeysUpper(row);
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
    enterprise_id: optNum('ENTERPRISE_ID') ?? optNum('TENANT_ID'),
    structure_code: optStr('STRUCTURE_CODE'),
    structure_name: optStr('STRUCTURE_NAME'),
    active_flag: active != null ? String(active) : null,
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
 * @param {{ enterprise_id: number, structure_id: number|null, search: string|null, status: string|null }} filterInput
 * @param {{ page: number, pageSize: number }} pagination
 */
export async function listSalaryStructuresWithNestedJson(filterInput, pagination) {
  const filters = buildJsonViewFilterBinds(filterInput);
  const { rows, total } = await listSalaryStructuresFromJsonView(filters, pagination);
  return {
    data: rows.map(mapJsonViewRowToResponse),
    total
  };
}
