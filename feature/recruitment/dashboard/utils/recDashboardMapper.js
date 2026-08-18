/**
 * Map recruitment dashboard view rows to API JSON.
 * Values come from Oracle; Node only shapes keys and types.
 */

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

function toNumberOrNull(val) {
  if (val == null || val === '') return null;
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(val) {
  if (val == null || val === '') return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function coerceColumn(type, raw) {
  return type === 'number' ? toNumberOrNull(raw) : toStringOrNull(raw);
}

/**
 * @param {import('./recDashboardConstants.js').StatsColumn[]} columns
 * @param {number} enterpriseId
 */
export function emptyStatsRow(columns, enterpriseId) {
  const out = {};
  for (const col of columns) {
    const key = col.name.toLowerCase();
    out[key] = key === 'enterprise_id' ? enterpriseId : null;
  }
  return out;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 * @param {import('./recDashboardConstants.js').StatsColumn[]} columns
 * @param {number} enterpriseId
 */
export function mapStatsViewRow(row, columns, enterpriseId) {
  if (!row) return emptyStatsRow(columns, enterpriseId);

  const m = rowKeyMap(row);
  const out = {};

  for (const col of columns) {
    const key = col.name.toLowerCase();
    out[key] = coerceColumn(col.type, m[key]);
  }

  if (out.enterprise_id == null) out.enterprise_id = enterpriseId;
  return out;
}
