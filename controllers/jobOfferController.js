import { generateOfferLetterPdf, getOfferByGuid } from '../services/jobOfferPdf/index.js';
import { OfferPdfGenerationError } from '../services/jobOfferPdf/errors.js';
import { PDF_ERROR_MESSAGE } from '../services/jobOfferPdf/constants.js';
import { sendOfferPdfResponse } from '../services/jobOfferPdf/response.js';
import { handleReadError } from '../feature/recruitment/shared/recControllerHelpers.js';
import { READ_ERROR_MESSAGE } from '../feature/recruitment/job_offers/utils/recJobOfferConstants.js';
import { sendJobOfferNotFoundResponse } from '../feature/recruitment/job_offers/utils/recJobOfferResponses.js';
import { parseOfferGuidParam } from '../feature/recruitment/job_offers/utils/recJobOfferValidators.js';

/**
 * GET /api/rec/job-offers/:offerGuid/pdf
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export async function getOfferPdf(req, res) {
  try {
    const offerGuid = parseOfferGuidParam(req.params.offerGuid);
    const offer = await getOfferByGuid(offerGuid);

    if (!offer) {
      return sendJobOfferNotFoundResponse(res);
    }

    const pdfBuffer = await generateOfferLetterPdf(offer);
    return sendOfferPdfResponse(res, pdfBuffer, offer.offer_number, offerGuid);
  } catch (err) {
    if (err instanceof OfferPdfGenerationError) {
      return res.status(500).json({
        success: false,
        message: PDF_ERROR_MESSAGE,
        error: err.errorMessage
      });
    }
    return handleReadError(res, err, READ_ERROR_MESSAGE);
  }
}
