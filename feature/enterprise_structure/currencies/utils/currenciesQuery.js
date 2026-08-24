/**
 * Shared helpers for ENT.CURRENCIES list (pure — no DB import).
 */

const MAX_SEARCH_LENGTH = 100;

const SELECT_SQL =
  'SELECT CURRENCY_CODE, CURRENCY_NAME FROM ENT.CURRENCIES';

const ORDER_SQL = 'ORDER BY CURRENCY_NAME, CURRENCY_CODE';

const SEARCH_WHERE_SQL =
  `WHERE (` +
  `UPPER(CURRENCY_CODE) LIKE '%' || UPPER(:search) || '%' ` +
  `OR UPPER(CURRENCY_NAME) LIKE '%' || UPPER(:search) || '%'` +
  `)`;

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
 * Build SELECT + binds for currency list (code + name).
 * @param {{ search?: string|null }} [filters]
 * @returns {{ sql: string, binds: Record<string, string> }}
 */
export function buildCurrenciesListQuery(filters = {}) {
  const search = normalizeCurrencySearch(filters.search);
  const parts = [SELECT_SQL];
  const binds = {};

  if (search != null) {
    parts.push(SEARCH_WHERE_SQL);
    binds.search = search;
  }

  parts.push(ORDER_SQL);
  return { sql: parts.join(' '), binds };
}

/**
 * @param {Array<{ currency_code?: string, currency_name?: string }>|null|undefined} rows
 * @returns {Array<{ currency_code: string|null, currency_name: string|null }>}
 */
export function mapCurrencyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => ({
    currency_code: row?.currency_code ?? null,
    currency_name: row?.currency_name ?? null
  }));
}
