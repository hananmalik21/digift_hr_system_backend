import express from 'express';
import { asyncHandler } from '../../../../middleware/asyncHandler.js';
import {
  handleMutationError,
  logRecruitmentAudit,
  resolveAuditActor
} from '../../shared/recControllerHelpers.js';
import {
  acceptOfferViaPackage,
  createJobOfferViaPackage,
  declineOfferViaPackage,
  withdrawOfferViaPackage
} from '../model/recJobOffersModel.js';
import { MUTATION_ERROR_MESSAGE } from '../utils/recJobOfferConstants.js';
import {
  sendCreateJobOfferResponse,
  sendJobOfferActionResponse
} from '../utils/recJobOfferResponses.js';
import {
  parseOfferGuidParam,
  validateCreateJobOfferBody,
  validateOfferActionBody
} from '../utils/recJobOfferValidators.js';

const AUDIT_TAG = 'recJobOffers';
const router = express.Router();

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

/**
 * POST /api/rec/job-offers/:offer_guid/accept
 */
router.post(
  '/:offer_guid/accept',
  asyncHandler(async (req, res) => {
    try {
      const offer_guid = parseOfferGuidParam(req.params.offer_guid);
      const body = { ...(req.body || {}) };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      const validated = validateOfferActionBody(body, offer_guid);

      const pkg = await acceptOfferViaPackage(validated);
      logRecruitmentAudit(AUDIT_TAG, 'accept', req, { offer_guid, status: pkg.status });
      return sendJobOfferActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

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
      const validated = validateOfferActionBody(body, offer_guid);

      const pkg = await declineOfferViaPackage(validated);
      logRecruitmentAudit(AUDIT_TAG, 'decline', req, { offer_guid, status: pkg.status });
      return sendJobOfferActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

/**
 * POST /api/rec/job-offers/:offer_guid/withdraw
 */
router.post(
  '/:offer_guid/withdraw',
  asyncHandler(async (req, res) => {
    try {
      const offer_guid = parseOfferGuidParam(req.params.offer_guid);
      const body = { ...(req.body || {}) };
      body.updated_by = resolveAuditActor(req, body, 'updated_by');
      const validated = validateOfferActionBody(body, offer_guid);

      const pkg = await withdrawOfferViaPackage(validated);
      logRecruitmentAudit(AUDIT_TAG, 'withdraw', req, { offer_guid, status: pkg.status });
      return sendJobOfferActionResponse(res, pkg);
    } catch (err) {
      return handleMutationError(res, err, MUTATION_ERROR_MESSAGE);
    }
  })
);

export default router;
