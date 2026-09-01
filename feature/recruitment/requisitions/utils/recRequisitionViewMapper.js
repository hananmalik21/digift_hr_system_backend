import { bufferToHex, normalizeApiGuidString } from '@digifyhr/common';

const LOG_TAG = 'recRequisitionViewMapper';

const NESTED_GUID_KEYS = new Set([
  'position_id',
  'position_guid',
  'org_unit_id',
  'org_unit_guid',
  'org_structure_id',
  'parent_org_unit_id',
  'reports_to_position_id',
  'req_justification_guid',
  'requisition_guid',
  'employee_id',
  'user_id',
  'grade_id',
  'job_family_id',
  'job_level_id',
  'primary_location_id'
]);

/** @type {ReadonlyArray<{ key: string, asArray?: boolean }>} */
const VIEW_JSON_COLUMNS = Object.freeze([
  { key: 'position_obj' },
  { key: 'org_unit_obj' },
  { key: 'org_hierarchy_json', asArray: true },
  { key: 'job_family_obj' },
  { key: 'job_level_obj' },
  { key: 'grade_obj' },
  { key: 'requisition_detail_obj' },
  { key: 'status_obj' },
  { key: 'justification_obj' },
  { key: 'justification_org_hierarchy_json', asArray: true },
  { key: 'position_detail_obj' },
  { key: 'education_experience_obj' },
  { key: 'hiring_team_obj' },
  { key: 'interview_panel_json', asArray: true },
  { key: 'skills_json', asArray: true },
  { key: 'budget_obj' },
  { key: 'audit_obj' },
  { key: 'quick_stats_obj' }
]);

const QUICK_STATS_KEYS = Object.freeze([
  'applications',
  'shortlisted',
  'in_interview',
  'days_open'
]);

const STATUS_SCALAR_KEYS = Object.freeze([
  'approval_status_code',
  'open_status_code',
  'submitted_by',
  'submitted_date',
  'approved_by',
  'approved_date',
  'opened_by',
  'opened_date',
  'closed_by',
  'closed_date',
  'rejected_by',
  'rejected_date',
  'rejection_reason'
]);

export function rowKeyMap(row) {
  const m = {};
  if (!row || typeof row !== 'object') return m;
  for (const [k, v] of Object.entries(row)) {
    m[String(k).toLowerCase()] = v;
  }
  return m;
}

async function readLobVal(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Buffer.isBuffer(v) && !Array.isArray(v)) {
    return v;
  }
  if (typeof v.getData === 'function') {
    try {
      const p = v.getData();
      const data =
        typeof p?.then === 'function'
          ? await p
          : await new Promise((res, rej) => v.getData((err, d) => (err ? rej(err) : res(d))));
      return data != null ? String(data) : null;
    } catch {
      return null;
    }
  }
  return String(v);
}

function safeFiniteNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v) {
  if (v == null || v === '') return null;
  return String(v);
}

export function formatDateString(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  return String(v);
}

function normalizeGuidHex(raw) {
  if (raw == null) return null;
  const h = bufferToHex(raw);
  return h ? String(h).toUpperCase() : null;
}

/**
 * @param {unknown} raw
 * @param {string} label
 * @param {boolean} asArray
 */
export async function parseJsonColumn(raw, label, asArray = false) {
  if (raw == null) return asArray ? [] : null;
  if (asArray && Array.isArray(raw)) return raw;
  if (!asArray && typeof raw === 'object' && !Buffer.isBuffer(raw) && !Array.isArray(raw)) {
    return raw;
  }

  const text = await readLobVal(raw);
  if (text == null) return asArray ? [] : null;
  if (typeof text === 'object' && !Array.isArray(text)) return text;
  if (Array.isArray(text)) return text;

  const s = String(text).trim();
  if (!s) return asArray ? [] : null;

  try {
    const parsed = JSON.parse(s);
    if (asArray) return Array.isArray(parsed) ? parsed : [];
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch (err) {
    console.error(`[${LOG_TAG}] JSON parse failed for ${label}`, err?.message || err);
    return asArray ? [] : null;
  }
}

/**
 * Parse all known JSON/CLOB columns from a view row (lowercase key map).
 * @param {Record<string, unknown>} m
 */
async function parseViewJsonColumns(m) {
  const values = await Promise.all(
    VIEW_JSON_COLUMNS.map(({ key, asArray = false }) => parseJsonColumn(m[key], key, asArray))
  );
  /** @type {Record<string, unknown>} */
  const out = {};
  VIEW_JSON_COLUMNS.forEach(({ key }, i) => {
    out[key] = values[i];
  });
  return out;
}

function resolveDisplayStatus(approvalCode, openCode) {
  const a = String(approvalCode ?? '').trim().toUpperCase();
  const o = String(openCode ?? '').trim().toUpperCase();
  if (a === 'DRAFT') return 'Draft';
  if (a === 'PENDING_APPROVAL') return 'Pending Approval';
  if (a === 'REJECTED') return 'Rejected';
  if (a === 'WITHDRAWN') return 'Withdrawn';
  if (a === 'APPROVED') {
    if (o === 'OPEN') return 'Open';
    if (o === 'ON_HOLD') return 'On Hold';
    if (o === 'CLOSED') return 'Closed';
    return 'Approved';
  }
  return null;
}

function shapeOrgUnit(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return {
    org_unit_id: normalizeApiGuidString(obj.org_unit_id),
    org_unit_code: strOrNull(obj.org_unit_code),
    org_unit_name_en: strOrNull(obj.org_unit_name_en),
    org_unit_name_ar: strOrNull(obj.org_unit_name_ar),
    level_code: strOrNull(obj.level_code),
    org_structure_id: normalizeApiGuidString(obj.org_structure_id),
    parent_org_unit_id: normalizeApiGuidString(obj.parent_org_unit_id)
  };
}

function shapeOrgHierarchy(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((item) => {
      const base = shapeOrgUnit(item);
      if (!base) return null;
      return {
        ...base,
        hierarchy_level: safeFiniteNumber(item?.hierarchy_level)
      };
    })
    .filter(Boolean);
}

function shapeJustification(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return {
    req_justification_id: safeFiniteNumber(obj.req_justification_id),
    req_justification_guid: normalizeApiGuidString(obj.req_justification_guid),
    position_type_code: strOrNull(obj.position_type_code),
    business_justification: strOrNull(obj.business_justification),
    impact_if_not_filled: strOrNull(obj.impact_if_not_filled),
    reports_to_position_id: normalizeApiGuidString(obj.reports_to_position_id),
    reports_to_position_code: strOrNull(obj.reports_to_position_code),
    reports_to_position_name: strOrNull(obj.reports_to_position_name),
    org_unit_id: normalizeApiGuidString(obj.org_unit_id),
    org_unit_code: strOrNull(obj.org_unit_code),
    org_unit_name_en: strOrNull(obj.org_unit_name_en),
    org_unit_name_ar: strOrNull(obj.org_unit_name_ar),
    level_code: strOrNull(obj.level_code),
    org_structure_id: normalizeApiGuidString(obj.org_structure_id),
    parent_org_unit_id: normalizeApiGuidString(obj.parent_org_unit_id),
    cost_center_id: strOrNull(obj.cost_center_id)
  };
}

function shapeJobLevel(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  return {
    job_level_id: safeFiniteNumber(obj.job_level_id),
    level_code: strOrNull(obj.level_code),
    level_name: strOrNull(obj.level_name)
  };
}

/** QUICK_STATS_OBJ from the view — values are not recalculated in Node. */
function shapeQuickStats(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const key of QUICK_STATS_KEYS) {
    out[key] = safeFiniteNumber(obj[key]);
  }
  return out;
}

function shapeGenericParsedObject(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (NESTED_GUID_KEYS.has(k) || (k.endsWith('_guid') && v != null)) {
      out[k] = normalizeApiGuidString(v);
    } else if (v instanceof Date) {
      out[k] = formatDateString(v);
    } else if (Buffer.isBuffer(v)) {
      out[k] = normalizeApiGuidString(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function shapeGenericParsedArray(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((item) =>
    item != null && typeof item === 'object' && !Array.isArray(item)
      ? shapeGenericParsedObject(item)
      : item
  );
}

function pickScalar(m, statusObj, field) {
  const fromRow = m[field];
  if (fromRow != null) return fromRow;
  return statusObj?.[field] ?? null;
}

function buildStatusScalars(m, statusObj) {
  const out = {};
  for (const key of STATUS_SCALAR_KEYS) {
    out[key] = pickScalar(m, statusObj, key);
  }
  return out;
}

function shapeStatus(statusObj, scalars) {
  const approval_status_code = strOrNull(scalars.approval_status_code);
  const open_status_code = strOrNull(scalars.open_status_code);
  const displayFromObj =
    statusObj?.display_status != null ? String(statusObj.display_status).trim() : null;

  return {
    approval_status_code,
    open_status_code,
    submitted_by: strOrNull(scalars.submitted_by),
    submitted_date: formatDateString(scalars.submitted_date),
    approved_by: strOrNull(scalars.approved_by),
    approved_date: formatDateString(scalars.approved_date),
    opened_by: strOrNull(scalars.opened_by),
    opened_date: formatDateString(scalars.opened_date),
    closed_by: strOrNull(scalars.closed_by),
    closed_date: formatDateString(scalars.closed_date),
    rejected_by: strOrNull(scalars.rejected_by),
    rejected_date: formatDateString(scalars.rejected_date),
    rejection_reason: strOrNull(scalars.rejection_reason),
    display_status:
      displayFromObj ||
      resolveDisplayStatus(approval_status_code, open_status_code) ||
      null
  };
}

/**
 * @param {Record<string, unknown>} row
 */
export async function mapViewRowToListItem(row) {
  const m = rowKeyMap(row);
  const json = await parseViewJsonColumns(m);

  const statusScalars = buildStatusScalars(m, json.status_obj);
  const status = shapeStatus(json.status_obj, statusScalars);

  return {
    requisition_id: safeFiniteNumber(m.requisition_id),
    requisition_guid: normalizeGuidHex(m.requisition_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),
    requisition_number: m.requisition_number != null ? String(m.requisition_number) : null,
    requisition_title: m.requisition_title != null ? String(m.requisition_title) : null,
    approval_status_code: status.approval_status_code,
    open_status_code: status.open_status_code,
    submitted_by: status.submitted_by,
    submitted_date: status.submitted_date,
    approved_by: status.approved_by,
    approved_date: status.approved_date,
    opened_by: status.opened_by,
    opened_date: status.opened_date,
    closed_by: status.closed_by,
    closed_date: status.closed_date,
    rejected_by: status.rejected_by,
    rejected_date: status.rejected_date,
    rejection_reason: status.rejection_reason,
    position: shapeGenericParsedObject(json.position_obj),
    org_unit: shapeOrgUnit(json.org_unit_obj),
    org_hierarchy: shapeOrgHierarchy(json.org_hierarchy_json),
    job_family: shapeGenericParsedObject(json.job_family_obj),
    job_level: shapeJobLevel(json.job_level_obj),
    grade: shapeGenericParsedObject(json.grade_obj),
    // Location bilingual fields + primary_location_id come from REQUISITION_DETAIL_OBJ.
    requisition_detail: shapeGenericParsedObject(json.requisition_detail_obj),
    status,
    justification: shapeJustification(json.justification_obj),
    justification_org_hierarchy: shapeOrgHierarchy(json.justification_org_hierarchy_json),
    position_detail: shapeGenericParsedObject(json.position_detail_obj),
    education_experience: shapeGenericParsedObject(json.education_experience_obj),
    hiring_team: shapeGenericParsedObject(json.hiring_team_obj),
    interview_panel: shapeGenericParsedArray(json.interview_panel_json),
    skills: shapeGenericParsedArray(json.skills_json),
    budget: shapeGenericParsedObject(json.budget_obj),
    audit: shapeGenericParsedObject(json.audit_obj),
    quick_stats: shapeQuickStats(json.quick_stats_obj)
  };
}

/**
 * Detail uses same shape as list row (full view row mapped).
 * @param {Record<string, unknown>} row
 */
export async function mapViewRowToDetail(row) {
  return mapViewRowToListItem(row);
}
