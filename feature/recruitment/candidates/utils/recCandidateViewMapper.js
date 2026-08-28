import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { formatDateOnly } from '../../candidate_matches/utils/recCandidateMatchMappers.js';
import { CANDIDATE_DOB_VIEW_COLUMN } from './recCandidateProfileFields.js';
import {
  CANDIDATE_JSON_COLLECTION_API_FIELDS,
  CANDIDATE_JSON_COLLECTION_VIEW_TO_API,
  CANDIDATE_SKILLS_VIEW_COLUMN
} from './recCandidateChildJsonUtils.js';
import { mapCandidateSkillsResponse } from './recCandidateSkillMappers.js';
import { CANDIDATE_LIST_API_FIELDS } from './recCandidateViewConstants.js';

const RESUME_EXCLUDED_FIELDS = new Set(['file_content']);

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

/**
 * Safe parse for Oracle JSON/CLOB columns.
 * NULL, invalid JSON, or non-array when `asArray` → [].
 * @param {unknown} raw
 * @param {boolean} asArray
 * @param {string} [columnName]
 */
export async function parseJsonColumn(raw, asArray = false, columnName = 'json') {
  if (raw == null) return asArray ? [] : null;
  if (asArray && Array.isArray(raw)) return raw;
  if (!asArray && typeof raw === 'object' && !Buffer.isBuffer(raw) && !Array.isArray(raw)) {
    return raw;
  }

  const text = await readLobVal(raw);
  if (text == null) return asArray ? [] : null;
  if (typeof text === 'object') return text;

  const s = String(text).trim();
  if (!s || s.toLowerCase() === 'null') return asArray ? [] : null;

  try {
    const parsed = JSON.parse(s);
    if (asArray) return Array.isArray(parsed) ? parsed : [];
    return parsed;
  } catch (err) {
    console.error(`[recCandidateViewMapper] Failed to parse ${columnName}:`, err?.message ?? err);
    return asArray ? [] : null;
  }
}

/** Nested JSON array columns stored as VARCHAR2 inside JSON_OBJECT aggregates. */
const NESTED_JSON_ARRAY_FIELDS = ['skills_json'];

/**
 * Parse stringified JSON arrays on nested objects (e.g. assessment.skills_json).
 * @param {unknown} items
 */
function normalizeNestedJsonArrayFields(items) {
  if (!Array.isArray(items)) return items;

  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const out = { ...item };

    for (const field of NESTED_JSON_ARRAY_FIELDS) {
      const key =
        field in out
          ? field
          : Object.keys(out).find((k) => String(k).toLowerCase() === field);
      if (!key) continue;

      const raw = out[key];
      if (raw == null || raw === '') {
        out[key] = [];
        continue;
      }
      if (Array.isArray(raw)) continue;

      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
          out[key] = [];
          continue;
        }
        try {
          const parsed = JSON.parse(trimmed);
          out[key] = Array.isArray(parsed) ? parsed : [];
        } catch {
          out[key] = [];
        }
      }
    }

    return out;
  });
}

/**
 * Strip binary resume content from view JSON; detail GET uses resume_link instead.
 * @param {unknown[]} resumes
 */
function sanitizeResumeCollection(resumes) {
  if (!Array.isArray(resumes)) return [];
  return resumes.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const out = {};
    for (const [k, v] of Object.entries(item)) {
      if (RESUME_EXCLUDED_FIELDS.has(String(k).toLowerCase())) continue;
      out[k] = v;
    }
    return out;
  });
}

function formatDateValue(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  return v;
}

function normalizeScalar(key, v) {
  if (v == null) return null;
  if (key.endsWith('_guid') || key === 'candidate_guid' || key === 'resume_guid') {
    return normalizeApiGuidString(v);
  }
  if (Buffer.isBuffer(v)) {
    return normalizeApiGuidString(v);
  }
  if (v instanceof Date) {
    return formatDateValue(v);
  }
  return v;
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} viewColumn
 * @param {unknown} raw
 */
async function mapJsonCollectionColumn(row, viewColumn, raw) {
  const apiField = CANDIDATE_JSON_COLLECTION_VIEW_TO_API[viewColumn];
  let parsed = await parseJsonColumn(raw, true, viewColumn);

  if (viewColumn === CANDIDATE_SKILLS_VIEW_COLUMN) {
    parsed = mapCandidateSkillsResponse(parsed);
  } else if (viewColumn === 'assessments_json') {
    parsed = normalizeNestedJsonArrayFields(parsed);
  } else if (viewColumn === 'resumes_json') {
    parsed = sanitizeResumeCollection(parsed);
  }

  return { apiField, parsed };
}

function ensureJsonCollectionDefaults(out) {
  for (const field of CANDIDATE_JSON_COLLECTION_API_FIELDS) {
    if (out[field] == null) out[field] = [];
  }
}

/**
 * Map one REC.CANDIDATES_FULL_V row to API detail JSON.
 * @param {Record<string, unknown>} row
 * @param {{ omitColumns?: string[] }} [options]
 */
export async function mapCandidateViewRow(row, options = {}) {
  if (!row || typeof row !== 'object') return null;

  const omit = new Set((options.omitColumns ?? []).map((c) => String(c).toLowerCase()));

  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase();
    if (omit.has(key)) continue;

    const jsonMapping = CANDIDATE_JSON_COLLECTION_VIEW_TO_API[key];
    if (jsonMapping) {
      const { apiField, parsed } = await mapJsonCollectionColumn(row, key, v);
      out[apiField] = parsed;
      continue;
    }

    if (key === CANDIDATE_DOB_VIEW_COLUMN) {
      out.dob = formatDateOnly(v);
      continue;
    }

    out[key] = normalizeScalar(key, v);
  }

  if (out.candidate_guid == null) {
    const rawGuid = row.CANDIDATE_GUID ?? row.candidate_guid;
    if (rawGuid != null) {
      out.candidate_guid = normalizeApiGuidString(rawGuid) ?? bufferToHex(rawGuid);
    }
  }

  ensureJsonCollectionDefaults(out);
  return out;
}

/** JSON view columns omitted from slim list responses (skills are kept). */
const LIST_OMIT_JSON_VIEW_COLUMNS = Object.keys(CANDIDATE_JSON_COLLECTION_VIEW_TO_API).filter(
  (column) => column !== CANDIDATE_SKILLS_VIEW_COLUMN
);

/**
 * Map one REC.CANDIDATES_FULL_V list row to the slim list API shape.
 * Includes `skills`; omits other large JSON collections.
 * @param {Record<string, unknown>} row
 */
export async function mapCandidateListViewRow(row) {
  if (!row || typeof row !== 'object') return null;

  const detail = await mapCandidateViewRow(row, {
    omitColumns: LIST_OMIT_JSON_VIEW_COLUMNS
  });

  const out = {};
  for (const field of CANDIDATE_LIST_API_FIELDS) {
    if (field in detail) out[field] = detail[field];
  }
  if (detail.skills != null) out.skills = detail.skills;
  return out;
}
