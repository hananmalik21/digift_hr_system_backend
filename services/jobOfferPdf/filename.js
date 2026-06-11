/**
 * @param {string|null|undefined} offerNumber
 * @param {string} offerGuid
 */
export function buildOfferPdfFilename(offerNumber, offerGuid) {
  const safeBase = String(offerNumber || offerGuid || 'offer')
    .trim()
    .replace(/[^\w.-]+/g, '_')
    .slice(0, 120);

  return `offer-letter-${safeBase || 'offer'}.pdf`;
}
