import { buildOfferPdfFilename } from './filename.js';

/**
 * @param {import('express').Response} res
 * @param {Buffer} pdfBuffer
 * @param {string|null|undefined} offerNumber
 * @param {string} offerGuid
 */
export function sendOfferPdfResponse(res, pdfBuffer, offerNumber, offerGuid) {
  const fileName = buildOfferPdfFilename(offerNumber, offerGuid);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
  res.setHeader('Content-Length', String(pdfBuffer.length));
  return res.send(pdfBuffer);
}
