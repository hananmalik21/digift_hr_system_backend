import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';

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
  'job_level_id'
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

function resolveDisplayStatus(approvalCode, openCode) {
  const a = String(approvalCode ?? '').trim().toUpperCase();
  const o = String(openCode ?? '').trim().toUpperCase();
  if (a === 'DRAFT') return 'Draft';
  if (a === 'PENDING_APPROVAL') return 'Pending Approval';
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
  return {
    approval_status_code: pickScalar(m, statusObj, 'approval_status_code'),
    open_status_code: pickScalar(m, statusObj, 'open_status_code'),
    submitted_by: pickScalar(m, statusObj, 'submitted_by'),
    submitted_date: pickScalar(m, statusObj, 'submitted_date'),
    approved_by: pickScalar(m, statusObj, 'approved_by'),
    approved_date: pickScalar(m, statusObj, 'approved_date'),
    opened_by: pickScalar(m, statusObj, 'opened_by'),
    opened_date: pickScalar(m, statusObj, 'opened_date'),
    closed_by: pickScalar(m, statusObj, 'closed_by'),
    closed_date: pickScalar(m, statusObj, 'closed_date')
  };
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

  const [
    positionRaw,
    orgUnitRaw,
    orgHierarchyRaw,
    jobFamilyRaw,
    jobLevelRaw,
    gradeRaw,
    requisitionDetailRaw,
    statusRaw,
    justificationRaw,
    justificationOrgHierarchyRaw,
    positionDetailRaw,
    educationExperienceRaw,
    hiringTeamRaw,
    interviewPanelRaw,
    skillsRaw,
    budgetRaw,
    auditRaw
  ] = await Promise.all([
    parseJsonColumn(m.position_obj, 'position_obj', false),
    parseJsonColumn(m.org_unit_obj, 'org_unit_obj', false),
    parseJsonColumn(m.org_hierarchy_json, 'org_hierarchy_json', true),
    parseJsonColumn(m.job_family_obj, 'job_family_obj', false),
    parseJsonColumn(m.job_level_obj, 'job_level_obj', false),
    parseJsonColumn(m.grade_obj, 'grade_obj', false),
    parseJsonColumn(m.requisition_detail_obj, 'requisition_detail_obj', false),
    parseJsonColumn(m.status_obj, 'status_obj', false),
    parseJsonColumn(m.justification_obj, 'justification_obj', false),
    parseJsonColumn(m.justification_org_hierarchy_json, 'justification_org_hierarchy_json', true),
    parseJsonColumn(m.position_detail_obj, 'position_detail_obj', false),
    parseJsonColumn(m.education_experience_obj, 'education_experience_obj', false),
    parseJsonColumn(m.hiring_team_obj, 'hiring_team_obj', false),
    parseJsonColumn(m.interview_panel_json, 'interview_panel_json', true),
    parseJsonColumn(m.skills_json, 'skills_json', true),
    parseJsonColumn(m.budget_obj, 'budget_obj', false),
    parseJsonColumn(m.audit_obj, 'audit_obj', false)
  ]);

  const statusScalars = buildStatusScalars(m, statusRaw);
  const status = shapeStatus(statusRaw, statusScalars);

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
    position: shapeGenericParsedObject(positionRaw),
    org_unit: shapeOrgUnit(orgUnitRaw),
    org_hierarchy: shapeOrgHierarchy(orgHierarchyRaw),
    job_family: shapeGenericParsedObject(jobFamilyRaw),
    job_level: shapeJobLevel(jobLevelRaw),
    grade: shapeGenericParsedObject(gradeRaw),
    requisition_detail: shapeGenericParsedObject(requisitionDetailRaw),
    status,
    justification: shapeJustification(justificationRaw),
    justification_org_hierarchy: shapeOrgHierarchy(justificationOrgHierarchyRaw),
    position_detail: shapeGenericParsedObject(positionDetailRaw),
    education_experience: shapeGenericParsedObject(educationExperienceRaw),
    hiring_team: shapeGenericParsedObject(hiringTeamRaw),
    interview_panel: shapeGenericParsedArray(interviewPanelRaw),
    skills: shapeGenericParsedArray(skillsRaw),
    budget: shapeGenericParsedObject(budgetRaw),
    audit: shapeGenericParsedObject(auditRaw)
  };
}

/**
 * Detail uses same shape as list row (full view row mapped).
 * @param {Record<string, unknown>} row
 */
export async function mapViewRowToDetail(row) {
  return mapViewRowToListItem(row);
}
