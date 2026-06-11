import { renderHtmlToPdf } from './browser.js';
import { generateOfferLetterHtml } from './template.js';
import { assertOfferForPdf } from './validate.js';

/** @typedef {import('./types.js').NormalizedJobOffer} NormalizedJobOffer */

/**
 * @param {NormalizedJobOffer} offer
 * @returns {Promise<Buffer>}
 */
export async function generateOfferLetterPdf(offer) {
  assertOfferForPdf(offer);
  const html = generateOfferLetterHtml(offer);
  return renderHtmlToPdf(html);
}
