import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';

const JSON_ARRAY_COLUMNS = new Set([
  'education_json',
  'experience_json',
  'resumes_json',
  'background_checks_json',
  'talent_pools_json'
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
async function parseJsonColumn(raw, asArray = false) {
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
      out[key] = await parseJsonColumn(v, true);
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
