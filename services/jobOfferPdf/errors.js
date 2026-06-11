import { AppError } from '../../utils/errors/AppError.js';
import { PDF_ERROR_MESSAGE } from './constants.js';

export class OfferPdfGenerationError extends AppError {
  /**
   * @param {unknown} [cause]
   */
  constructor(cause) {
    super(PDF_ERROR_MESSAGE, 500, 'OFFER_PDF_GENERATION_FAILED');
    this.cause = cause;
  }
}
