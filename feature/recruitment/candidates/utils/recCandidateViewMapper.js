import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';

const JSON_ARRAY_COLUMNS = new Set([
  'education_json',
  'experience_json',
  'resumes_json',
  'background_checks_json',
  'talent_pools_json',
  'assessments_json'
]);

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
 * @param {unknown} raw
 * @param {boolean} asArray
 */
export async function parseJsonColumn(raw, asArray = false) {
  if (raw == null) return asArray ? [] : null;
  if (asArray && Array.isArray(raw)) return raw;
  if (!asArray && typeof raw === 'object' && !Buffer.isBuffer(raw) && !Array.isArray(raw)) {
    return raw;
  }

  const text = await readLobVal(raw);
  if (text == null) return asArray ? [] : null;
  if (typeof text === 'object') return text;

  const s = String(text).trim();
  if (!s) return asArray ? [] : null;

  try {
    const parsed = JSON.parse(s);
    if (asArray) return Array.isArray(parsed) ? parsed : [];
    return parsed;
  } catch {
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
 * Map one view row to API JSON (Oracle types only — no business rules).
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
    if (JSON_ARRAY_COLUMNS.has(key)) {
      let parsed = await parseJsonColumn(v, true);
      if (key === 'assessments_json') {
        parsed = normalizeNestedJsonArrayFields(parsed);
      }
      out[key] = parsed;
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

  return out;
}
