/**
 * Reusable optional-filter SQL fragments for view list queries.
 * Binds are created with `val: null`; call setBindValue when a filter is active.
 */

/**
 * @param {string} bindKey
 * @param {string} column
 */
export function optionalEqClause(bindKey, column) {
  return `(:${bindKey} IS NULL OR v.${column} = :${bindKey})`;
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
