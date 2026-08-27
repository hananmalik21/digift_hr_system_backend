/**
 * Shared helpers for ENT.CURRENCIES list (pure — no DB import).
 */

const MAX_SEARCH_LENGTH = 100;

const SELECT_SQL =
  'SELECT CURRENCY_CODE, CURRENCY_NAME, DECIMAL_PLACES FROM ENT.CURRENCIES';

const ORDER_SQL = 'ORDER BY CURRENCY_NAME, CURRENCY_CODE';

const SEARCH_WHERE_SQL =
  `WHERE (` +
  `UPPER(CURRENCY_CODE) LIKE '%' || UPPER(:search) || '%' ` +
  `OR UPPER(CURRENCY_NAME) LIKE '%' || UPPER(:search) || '%'` +
  `)`;

const BY_CODE_WHERE_SQL =
  'WHERE UPPER(CURRENCY_CODE) = UPPER(:currency_code)';

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
 * Map Oracle DECIMAL_PLACES to JSON (preserve null; do not default to 2).
 * @param {unknown} value
 * @returns {number|null}
 */
export function mapDecimalPlaces(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Build SELECT + binds for currency list (code, name, decimal places).
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
 * Build SELECT + binds for a single currency by exact code.
 * @param {string} currencyCode
 * @returns {{ sql: string, binds: { currency_code: string } }}
 */
export function buildCurrencyByCodeQuery(currencyCode) {
  return {
    sql: [SELECT_SQL, BY_CODE_WHERE_SQL].join(' '),
    binds: { currency_code: String(currencyCode).trim().toUpperCase() }
  };
}

/**
 * @param {Array<{ currency_code?: string, currency_name?: string, decimal_places?: number|null }>|null|undefined} rows
 * @returns {Array<{ currency_code: string|null, currency_name: string|null, decimal_places: number|null }>}
 */
export function mapCurrencyRows(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.map((row) => ({
    currency_code: row?.currency_code ?? null,
    currency_name: row?.currency_name ?? null,
    decimal_places: mapDecimalPlaces(row?.decimal_places)
  }));
}
