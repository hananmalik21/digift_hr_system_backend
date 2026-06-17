import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  handleMutationError,
  handleReadError,
  logRecruitmentAudit,
  resolveAuditActor
} from '../../shared/recControllerHelpers.js';
import {
  acceptOfferViaPackage,
  approveOfferViaPackage,
  createJobOfferViaPackage,
  declineOfferViaPackage,
  extendOfferViaPackage,
  rejectOfferViaPackage,
  withdrawOfferViaPackage
} from '../model/recJobOffersModel.js';
import { getJobOfferByGuid, jobOfferExists, listJobOffersFromView, listJobOffersForExport } from '../model/recJobOfferViewModel.js';
import { buildJobOffersExcelBuffer } from '../service/jobOfferExportService.js';
import { sendExcelExport } from '../../../../utils/excel/index.js';
import { MUTATION_ERROR_MESSAGE, READ_ERROR_MESSAGE } from '../utils/recJobOfferConstants.js';
import {
  sendCreateJobOfferResponse,
  sendJobOfferActionResponse,
  sendJobOfferDetailResponse,
  sendJobOfferListResponse,
  sendJobOfferNotFoundResponse
} from '../utils/recJobOfferResponses.js';
import {
  parseOfferGuidParam,
  validateCreateJobOfferBody,
  validateDeclineOfferBody,
  validateOfferActionBody
} from '../utils/recJobOfferValidators.js';

const AUDIT_TAG = 'recJobOffers';
const router = express.Router();

/**
 * GET /api/rec/job-offers
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const { rows, total, page, limit } = await listJobOffersFromView(req.query);
      return sendJobOfferListResponse(res, rows, { page, limit, total });
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/rec/job-offers/export
 * Same filters as list (enterprise_id required). Returns all matching rows as Excel.
 */
router.get(
  '/export',
  asyncHandler(async (req, res) => {
    try {
      const { rows } = await listJobOffersForExport(req.query);
      const enterpriseId = req.query?.enterprise_id;
      const { buffer, filename, rowCount } = await buildJobOffersExcelBuffer({
        rows,
        enterpriseId
      });

      if (rowCount === 0) {
        return res.status(404).json({
          success: false,
          message: 'No job offers found to export'
        });
      }

      return sendExcelExport(res, buffer, filename);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-offers
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      body.created_by = resolveAuditActor(req, body, 'created_by');
      const validated = validateCreateJobOfferBody(body);

      const pkg = await createJobOfferViaPackage(validated);
      logRecruitmentAudit(AUDIT_TAG, 'create', req, {
        enterprise_id: validated.enterprise_id,
        status: pkg.status
      });
      return sendCreateJobOfferResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

function registerOfferActionRoute(path, auditAction, packageFn) {
  router.post(
    path,
    asyncHandler(async (req, res) => {
      try {
        const offer_guid = parseOfferGuidParam(req.params.offer_guid);
        const body = { ...(req.body || {}) };
        body.updated_by = resolveAuditActor(req, body, 'updated_by');
        const validated = validateOfferActionBody(body, offer_guid);

        const pkg = await packageFn(validated);
        logRecruitmentAudit(AUDIT_TAG, auditAction, req, { offer_guid, status: pkg.status });
        return sendJobOfferActionResponse(res, pkg);
      } catch (err) {
        return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
      }
    })
  );
}

registerOfferActionRoute('/:offer_guid/approve', 'approve', approveOfferViaPackage);
registerOfferActionRoute('/:offer_guid/reject', 'reject', rejectOfferViaPackage);
registerOfferActionRoute('/:offer_guid/extend', 'extend', extendOfferViaPackage);
registerOfferActionRoute('/:offer_guid/accept', 'accept', acceptOfferViaPackage);
registerOfferActionRoute('/:offer_guid/withdraw', 'withdraw', withdrawOfferViaPackage);

/**
 * POST /api/rec/job-offers/:offer_guid/decline
 */
router.post(
  '/:offer_guid/decline',
  asyncHandler(async (req, res) => {
    try {
      const offer_guid = parseOfferGuidParam(req.params.offer_guid);
      const body = { ...(req.body || {}) };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      const validated = validateDeclineOfferBody(body, offer_guid);

      const pkg = await declineOfferViaPackage(validated);
      logRecruitmentAudit(AUDIT_TAG, 'decline', req, { offer_guid, status: pkg.status });
      return sendJobOfferActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * GET /api/rec/job-offers/:offer_guid
 */
router.get(
  '/:offer_guid',
  asyncHandler(async (req, res) => {
    try {
      const offer_guid = parseOfferGuidParam(req.params.offer_guid);

      const exists = await jobOfferExists(offer_guid);
      if (!exists) {
        return sendJobOfferNotFoundResponse(res);
      }

      const detail = await getJobOfferByGuid(offer_guid);
      if (!detail) {
        return sendJobOfferNotFoundResponse(res);
      }

      return sendJobOfferDetailResponse(res, detail);
    } catch (err) {
      return handleReadError(res, err, READ_ERROR_MESSAGE);
    }
  })
);

export default router;
