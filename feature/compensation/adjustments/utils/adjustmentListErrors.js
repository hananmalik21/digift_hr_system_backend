/**
 * Typed client errors for GET /api/comp/adjustments (query + row JSON parsing).
 */

export class AdjustmentListValidationError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AdjustmentListValidationError';
    this.statusCode = 400;
  }
}
