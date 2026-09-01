import { normalizeApiGuidString } from '@digifyhr/common';
import { CANDIDATE_SKILL_RESPONSE_FIELDS } from './recCandidateChildJsonUtils.js';

/**
 * Map one skill object from REC.CANDIDATES_FULL_V skills_json to API `skills` item.
 * @param {Record<string, unknown>} row
 */
export function mapCandidateSkillItem(row) {
  if (!row || typeof row !== 'object') return null;

  const out = {};
  for (const field of CANDIDATE_SKILL_RESPONSE_FIELDS) {
    const key =
      field in row ? field : Object.keys(row).find((k) => String(k).toLowerCase() === field);
    const raw = key != null ? row[key] : null;

    out[field] =
      field === 'candidate_skill_guid' ? normalizeApiGuidString(raw) : raw ?? null;
  }

  return out;
}

/**
 * @param {unknown[]} skills
 * @returns {Record<string, unknown>[]}
 */
export function mapCandidateSkillsResponse(skills) {
  if (!Array.isArray(skills)) return [];
  return skills.map((row) => mapCandidateSkillItem(row)).filter(Boolean);
}
