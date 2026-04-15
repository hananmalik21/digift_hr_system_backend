/**
 * First-line Oracle client error text (used after rollback / rethrow).
 * @param {unknown} error
 * @returns {string}
 */
export function getOracleErrorMessage(error) {
  if (!error) return 'Unknown Oracle error';
  return error.message || String(error);
}
