import { AppError } from '../../utils/errors/AppError.js';
import { PDF_ERROR_MESSAGE } from './constants.js';

/**
 * @param {unknown} cause
 */
function extractErrorMessage(cause) {
  if (!cause) return 'Unknown PDF generation error';
  if (cause instanceof Error) return cause.message || String(cause);
  return String(cause);
}

export class OfferPdfGenerationError extends AppError {
  /**
   * @param {unknown} [cause]
   */
  constructor(cause) {
    super(PDF_ERROR_MESSAGE, 500, 'OFFER_PDF_GENERATION_FAILED');
    this.cause = cause;
    this.errorMessage = extractErrorMessage(cause);
  }
}
