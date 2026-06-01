const FILTER_ALIAS_GROUPS = {
  experience: ['experience_code', 'experience'],
  location: ['location', 'current_location'],
  skill: ['skill_code', 'skill']
};

/** Years-of-experience bands for UI dropdown codes (skip when value is ALL). */
const EXPERIENCE_BANDS = Object.freeze({
  EXP_0_2: { min: 0, max: 2 },
  '0_2': { min: 0, max: 2 },
  EXP_3_5: { min: 3, max: 5 },
  '3_5': { min: 3, max: 5 },
  EXP_6_10: { min: 6, max: 10 },
  '6_10': { min: 6, max: 10 },
  EXP_10_PLUS: { min: 10, max: null },
  '10_PLUS': { min: 10, max: null }
});

/**
 * Drop empty / "all" filter query keys so Postman `experience_code=` does not interfere.
 * @param {Record<string, unknown>|undefined} query
 */
export function normalizeCandidateListQuery(query) {
  const out = { ...(query || {}) };
  for (const keys of Object.values(FILTER_ALIAS_GROUPS)) {
    for (const key of keys) {
      if (!(key in out)) continue;
      const s = String(out[key] ?? '').trim();
      if (!s || s.toUpperCase() === 'ALL' || s === '*') {
        delete out[key];
      }
    }
  }
  return out;
}

/**
 * @param {Record<string, unknown>|undefined} query
 * @param {string[]} keys
 * @returns {string|null}
 */
export function pickQueryFilterValue(query, ...keys) {
  for (const key of keys) {
    const raw = query?.[key];
    if (raw === undefined || raw === null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const upper = s.toUpperCase();
    if (upper === 'ALL' || upper === '*') continue;
    return s;
  }
  return null;
}

/**
 * @param {string} code
 * @returns {{ min: number|null, max: number|null }|null}
 */
export function resolveExperienceBand(code) {
  const key = String(code).trim().toUpperCase();
  return EXPERIENCE_BANDS[key] ?? EXPERIENCE_BANDS[String(code).trim()] ?? null;
}
