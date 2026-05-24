/**
 * @typedef {{ success_count: number, error_count: number, message: string, results: unknown }} BulkAdjustOutcome
 */

const DEFAULT_MESSAGE = 'Bulk compensation adjustment completed.';

/**
 * Oracle x_result_json often nests line results under `results` or `employees`
 * while duplicating counts already returned as OUT binds.
 *
 * @param {BulkAdjustOutcome} outcome
 * @returns {BulkAdjustOutcome}
 */
export function normalizeBulkAdjustOutcome(outcome) {
  const successCount = Number.isFinite(outcome.success_count) ? outcome.success_count : 0;
  const errorCount = Number.isFinite(outcome.error_count) ? outcome.error_count : 0;
  const message =
    outcome.message != null && String(outcome.message).trim() !== ''
      ? String(outcome.message).trim()
      : DEFAULT_MESSAGE;

  return {
    success_count: successCount,
    error_count: errorCount,
    message,
    results: extractResultsPayload(outcome.results)
  };
}

/**
 * @param {unknown} raw
 * @returns {unknown}
 */
function extractResultsPayload(raw) {
  if (raw == null) return [];

  if (Array.isArray(raw)) return raw;

  if (typeof raw !== 'object') return raw;

  const obj = /** @type {Record<string, unknown>} */ (raw);
  if (Array.isArray(obj.results)) return obj.results;
  if (Array.isArray(obj.employees)) return obj.employees;

  return obj;
}
