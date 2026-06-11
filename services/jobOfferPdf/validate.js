import { ValidationError } from '../../utils/errors/index.js';

/**
 * @param {unknown} offer
 * @returns {asserts offer is import('./types.js').NormalizedJobOffer}
 */
export function assertOfferForPdf(offer) {
  if (!offer || typeof offer !== 'object') {
    throw new ValidationError('Offer data is required to generate a PDF');
  }
}
