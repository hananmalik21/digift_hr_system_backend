/**
 * Shared helpers for ENT.CURRENCIES list (pure — no DB import).
 */

const MAX_SEARCH_LENGTH = 32;

/**
 * Normalize optional `search` query/filter to a trimmed string, or null.
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeCurrencySearch(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Build SELECT + binds for currency list.
 * @param {{ search?: string|null }} [filters]
 * @returns {{ sql: string, binds: Record<string, string> }}
 */
export function buildCurrenciesListQuery(filters = {}) {
  const search = normalizeCurrencySearch(filters.search);
  const binds = {};

  let sql = `SELECT CURRENCY_CODE FROM ENT.CURRENCIES`;

  if (search != null) {
    sql += ` WHERE UPPER(CURRENCY_CODE) LIKE '%' || UPPER(:search) || '%'`;
    binds.search = search;
  }

  sql += ` ORDER BY CURRENCY_CODE`;

  return { sql, binds };
}

/**
 * @param {Array<{ currency_code?: string }>|null|undefined} rows
 * @returns {Array<{ currency_code: string|undefined }>}
 */
export function mapCurrencyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => ({ currency_code: row?.currency_code }));
}
