import { ValidationError } from '../../../utils/errors/index.js';
import { isNonEmptyTrimmed } from './recViewModelUtils.js';

/**
 * Reusable optional-filter SQL fragments for Oracle view list queries.
 */

/**
 * @param {string} bindKey
 * @param {string} column
 * @param {string} [alias]
 */
export function optionalEqClause(bindKey, column, alias = 'v') {
  return `(:${bindKey} IS NULL OR ${alias}.${column} = :${bindKey})`;
}

/**
 * @param {string} bindKey
 * @param {string} column
 * @param {string} [alias]
 */
export function optionalLikeClause(bindKey, column, alias = 'v') {
  return `(:${bindKey} IS NULL OR LOWER(${alias}.${column}) LIKE LOWER(:${bindKey}) ESCAPE '\\')`;
}

/**
 * CSV IN for comma-separated codes (multi-select UI).
 * @param {string} bindKey
 * @param {string} column
 * @param {string} [alias]
 */
export function optionalCsvInClause(bindKey, column, alias = 'v') {
  return `(
    :${bindKey} IS NULL
    OR ${alias}.${column} IN (
      SELECT TRIM(REGEXP_SUBSTR(:${bindKey}, '[^,]+', 1, LEVEL))
      FROM DUAL
      CONNECT BY REGEXP_SUBSTR(:${bindKey}, '[^,]+', 1, LEVEL) IS NOT NULL
    )
  )`;
}

/**
 * @param {unknown} raw
 * @param {string[]} allowed
 * @param {string} fieldLabel
 * @returns {string|null} comma-separated codes for Oracle CSV IN, or single code
 */
export function parseQueryCodeFilter(raw, allowed, fieldLabel) {
  if (!isNonEmptyTrimmed(raw)) return null;
  const codes = String(raw)
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const invalid = codes.filter((c) => !allowed.includes(c));
  if (invalid.length) {
    throw new ValidationError('Validation failed', [
      `${fieldLabel} must be one of: ${allowed.join(', ')}`
    ]);
  }
  return codes.length > 1 ? codes.join(',') : codes[0] ?? null;
}

/**
 * @param {Record<string, { val: unknown }>} binds
 * @param {string} key
 * @param {unknown} value
 */
export function setBindValue(binds, key, value) {
  if (value != null && value !== undefined && binds[key]) {
    binds[key].val = value;
  }
}
