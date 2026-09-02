import { AppError } from '../../../../utils/errors/index.js';

/**
 * Structured audit log + timed package operation wrapper.
 * @param {string} tag
 * @param {(err: unknown) => AppError} mapError
 */
export function createLoggedOp(tag, mapError) {
  function log(operation, fields) {
    console.info(`[${tag}]`, JSON.stringify({ operation, ...fields }));
  }

  /**
   * @template T
   * @param {string} operation
   * @param {Record<string, unknown>} context
   * @param {() => Promise<{ result: T, extraLog?: Record<string, unknown> }>} work
   * @returns {Promise<T>}
   */
  async function runLoggedOp(operation, context, work) {
    const startedAt = Date.now();
    try {
      const { result, extraLog } = await work();
      log(operation, {
        ...context,
        success: true,
        ...(extraLog || {}),
        elapsed_ms: Date.now() - startedAt
      });
      return result;
    } catch (err) {
      const mapped = err instanceof AppError ? err : mapError(err);
      log(operation, {
        ...context,
        success: false,
        code: mapped.code,
        elapsed_ms: Date.now() - startedAt
      });
      throw mapped;
    }
  }

  return { log, runLoggedOp };
}
