import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { parseJsonStringArrayFromClob, readClobText } from './recJobPostingContentUtils.js';

/**
 * @param {Record<string, unknown>} row
 */
function rowKeyMap(row) {
  const m = {};
  if (!row || typeof row !== 'object') return m;
  for (const [k, v] of Object.entries(row)) {
    m[String(k).toLowerCase()] = v;
  }
  return m;
}

function safeFiniteNumber(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

/** Non-negative integer from view counts; null/invalid → 0. */
function countOrZero(val) {
  const n = safeFiniteNumber(val);
  if (n == null) return 0;
  return Math.max(0, Math.trunc(n));
}

function strOrNull(v) {
  if (v == null || v === '') return null;
  return String(v);
}

/**
 * @param {unknown} v
 */
export function formatDateOnly(v) {
  if (v == null) return null;
  if (v instanceof Date) {
    return Number.isFinite(v.getTime()) ? v.toISOString().slice(0, 10) : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function normalizeGuidValue(v) {
  if (v == null) return null;
  const hex = normalizeApiGuidString(v, { uppercase: false }) ?? bufferToHex(v);
  if (hex == null) return null;
  return String(hex).replace(/-/g, '').toLowerCase();
}

function normalizeYnFlag(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim().toUpperCase();
  return s === 'Y' || s === 'N' ? s : String(v);
}

async function readTextField(raw) {
  const text = await readClobText(raw);
  return text != null ? text : strOrNull(raw);
}

/**
 * Map one REC.V_JOB_POSTINGS row to API JSON.
 * @param {Record<string, unknown>} row
 */
export async function mapJobPostingViewRow(row) {
  const m = rowKeyMap(row);

  const [responsibilities, qualifications, posting_description, about_the_role] = await Promise.all([
    parseJsonStringArrayFromClob(m.responsibilities),
    parseJsonStringArrayFromClob(m.qualifications),
    readTextField(m.posting_description),
    readTextField(m.about_the_role)
  ]);

  return {
    posting_id: safeFiniteNumber(m.posting_id),
    posting_guid: normalizeGuidValue(m.posting_guid),
    enterprise_id: safeFiniteNumber(m.enterprise_id),

    requisition_id: safeFiniteNumber(m.requisition_id),
    requisition_guid: normalizeGuidValue(m.requisition_guid),
    requisition_number: strOrNull(m.requisition_number),
    requisition_title: strOrNull(m.requisition_title),

    approval_status_code: strOrNull(m.approval_status_code),
    open_status_code: strOrNull(m.open_status_code),

    posting_title: strOrNull(m.posting_title),
    posting_description,
    about_the_role,
    responsibilities,
    qualifications,

    visibility_code: strOrNull(m.visibility_code),
    status_code: strOrNull(m.status_code),

    start_date: formatDateOnly(m.start_date),
    end_date: formatDateOnly(m.end_date),

    internal_site_flag: normalizeYnFlag(m.internal_site_flag),
    external_site_flag: normalizeYnFlag(m.external_site_flag),
    linkedin_flag: normalizeYnFlag(m.linkedin_flag),

    posted_by: strOrNull(m.posted_by),
    posted_date: formatDateOnly(m.posted_date),
    paused_by: strOrNull(m.paused_by),
    paused_date: formatDateOnly(m.paused_date),
    closed_by: strOrNull(m.closed_by),
    closed_date: formatDateOnly(m.closed_date),

    number_of_openings: safeFiniteNumber(m.number_of_openings),
    priority_code: strOrNull(m.priority_code),
    employment_type_code: strOrNull(m.employment_type_code),
    work_mode_code: strOrNull(m.work_mode_code),

    target_start_date: formatDateOnly(m.target_start_date),
    expected_end_date: formatDateOnly(m.expected_end_date),

    position_id: normalizeGuidValue(m.position_id) ?? safeFiniteNumber(m.position_id),
    position_name: strOrNull(m.position_name),
    org_unit_id: normalizeGuidValue(m.org_unit_id),

    application_count: countOrZero(m.application_count),

    portal_visible_flag: normalizeYnFlag(m.portal_visible_flag),

    application_status: strOrNull(m.application_status),
    applied_flag: normalizeYnFlag(m.applied_flag),
    application_id: safeFiniteNumber(m.application_id),
    application_guid: normalizeGuidValue(m.application_guid),

    created_by: strOrNull(m.created_by),
    creation_date: formatDateOnly(m.creation_date),
    last_updated_by: strOrNull(m.last_updated_by),
    last_update_date: formatDateOnly(m.last_update_date)
  };
}
