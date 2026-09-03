/**
 * Shared helpers for ENT.V_ACTIVE_LOCATIONS list (pure — no DB import).
 */

export const LIST_ACTIVE_LOCATIONS_SQL = [
  'SELECT',
  '    LOCATION_ID,',
  '    COUNTRY_CODE,',
  '    LOCATION_NAME',
  'FROM ENT.V_ACTIVE_LOCATIONS',
  'ORDER BY LOCATION_NAME ASC'
].join('\n');

function toNumberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/**
 * @param {Array<Record<string, unknown>>|null|undefined} rows
 * @returns {Array<{ location_id: number|null, country_code: string|null, location_name: string|null }>}
 */
export function mapLocationRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => ({
    location_id: toNumberOrNull(row?.location_id ?? row?.LOCATION_ID),
    country_code: toStringOrNull(row?.country_code ?? row?.COUNTRY_CODE),
    location_name: toStringOrNull(row?.location_name ?? row?.LOCATION_NAME)
  }));
}
