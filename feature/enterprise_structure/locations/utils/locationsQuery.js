/**
 * Shared helpers for active locations list (pure — no DB import).
 * Source: ENT.V_LOCATIONS (ACTIVE_FLAG = 'Y'). ENT.V_ACTIVE_LOCATIONS is not present.
 */

export const LIST_ACTIVE_LOCATIONS_SQL = [
  'SELECT',
  '    LOCATION_ID,',
  '    COUNTRY_CODE,',
  '    LOCATION_NAME',
  'FROM ENT.V_LOCATIONS',
  "WHERE ACTIVE_FLAG = 'Y'",
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
