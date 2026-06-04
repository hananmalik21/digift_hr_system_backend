import { bufferToHex, normalizeApiGuidString } from '../../../../utils/guidUtils.js';
import { normalizeGuidInJsonObject } from '../../shared/recViewJsonUtils.js';
import { formatDateOnly } from '../../job_postings/utils/recJobPostingViewMapper.js';
import {
  INTERVIEW_VIEW_JSON_ARRAY_COLUMNS,
  INTERVIEW_VIEW_JSON_OBJECT_COLUMNS
} from './recCandidateInterviewConstants.js';
import { parseJsonColumn } from './recCandidateViewMapper.js';

const JSON_ARRAY_COLUMNS = new Set(INTERVIEW_VIEW_JSON_ARRAY_COLUMNS);
const JSON_OBJECT_COLUMNS = new Set(INTERVIEW_VIEW_JSON_OBJECT_COLUMNS);
const DATE_ONLY_KEYS = new Set(['interview_date']);
const DATE_TIME_KEYS = new Set(['creation_date', 'last_update_date']);
const TOP_LEVEL_GUID_KEYS = ['interview_guid', 'candidate_guid'];

function formatDateTime(v) {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.toISOString() : null;
  return v;
}

function normalizeScalar(key, v) {
  if (v == null) return null;
  if (key.endsWith('_guid') || Buffer.isBuffer(v)) {
    return normalizeApiGuidString(v) ?? bufferToHex(v);
  }
  if (DATE_ONLY_KEYS.has(key)) return formatDateOnly(v);
  if (DATE_TIME_KEYS.has(key) || v instanceof Date) return formatDateTime(v);
  return v;
}

/**
 * Map one REC.CANDIDATE_INTERVIEWS_V row to API JSON.
 * @param {Record<string, unknown>} row
 */
export async function mapCandidateInterviewViewRow(row) {
  if (!row || typeof row !== 'object') return null;

  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = String(k).toLowerCase();
    if (JSON_ARRAY_COLUMNS.has(key)) {
      out[key] = await parseJsonColumn(v, true);
      continue;
    }
    if (JSON_OBJECT_COLUMNS.has(key)) {
      out[key] = await parseJsonColumn(v, false);
      continue;
    }
    out[key] = normalizeScalar(key, v);
  }

  normalizeGuidInJsonObject(
    /** @type {Record<string, unknown>} */ (out.feedback_obj),
    'feedback_guid'
  );

  for (const guidKey of TOP_LEVEL_GUID_KEYS) {
    if (out[guidKey] == null) {
      const raw = row[guidKey.toUpperCase()] ?? row[guidKey];
      if (raw != null) {
        out[guidKey] = normalizeApiGuidString(raw) ?? bufferToHex(raw);
      }
    }
  }

  return out;
}
