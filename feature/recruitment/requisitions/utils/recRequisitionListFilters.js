const FILTER_ALIAS_GROUPS = {
  priority: ['priority_code', 'priority'],
  work_mode: ['work_mode_code', 'work_mode'],
  employment_type: ['employment_type_code', 'employment_type']
};

/**
 * Drop empty / "all" filter query keys so Postman `priority_code=` does not interfere.
 * @param {Record<string, unknown>|undefined} query
 */
export function normalizeListQuery(query) {
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
 * Resolve optional list filter codes from query (supports aliases and "All" = no filter).
 * @param {Record<string, unknown>|undefined} query
 * @param {string[]} keys — e.g. ['priority_code', 'priority']
 * @returns {string|null} uppercase code or null when unset / "all"
 */
export function pickQueryFilterCode(query, ...keys) {
  for (const key of keys) {
    const raw = query?.[key];
    if (raw === undefined || raw === null) continue;
    const s = String(raw).trim();
    if (!s) continue;
    const upper = s.toUpperCase();
    if (upper === 'ALL' || upper === '*') continue;
    return upper;
  }
  return null;
}
